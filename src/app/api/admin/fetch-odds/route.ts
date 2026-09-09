import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  return profile?.is_admin ? user : null;
}

function normalizeTeamName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

function sportradarUrl(path: string, apiKey: string) {
  const accessLevel = process.env.SPORTRADAR_ACCESS_LEVEL || "trial";
  return `https://api.sportradar.com/ncaafb/${accessLevel}/v7/en${path}?api_key=${apiKey}`;
}

// Generic recursive collector, same purpose as before: SportRadar's docs
// specify field names but not the exact JSON envelope, so we search for the
// shape we need (an object with all of `requiredKeys`) wherever it appears.
function collectObjectsWithKeys(node: any, requiredKeys: string[], out: any[]) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n) => collectObjectsWithKeys(n, requiredKeys, out));
    return;
  }
  if (requiredKeys.every((k) => node[k] !== undefined)) {
    out.push(node);
  }
  for (const key of Object.keys(node)) {
    collectObjectsWithKeys(node[key], requiredKeys, out);
  }
}

// ---- AP rankings, keyed by SportRadar's team GUID ----
async function fetchApRankings(apiKey: string, warnings: string[]): Promise<Map<string, number>> {
  const rankMap = new Map<string, number>();
  try {
    const year = new Date().getFullYear();
    const res = await fetch(sportradarUrl(`/polls/AP25/${year}/rankings.json`, apiKey), {
      cache: "no-store",
    });
    if (!res.ok) {
      warnings.push(`SportRadar rankings returned ${res.status}`);
      return rankMap;
    }
    const data = await res.json();
    const entries: any[] = [];
    collectObjectsWithKeys(data, ["rank", "team"], entries);
    for (const entry of entries) {
      const teamId = entry.team?.id;
      if (teamId && typeof entry.rank === "number") {
        rankMap.set(teamId, entry.rank);
      }
    }
    if (rankMap.size === 0) warnings.push("Parsed 0 ranked teams from SportRadar rankings response");
  } catch (e: any) {
    warnings.push(`SportRadar rankings fetch failed: ${e?.message ?? e}`);
  }
  return rankMap;
}

// ---- Standings: record, points-per-game, and conference -- all keyed by team GUID ----
type TeamStat = {
  id: string;
  market: string;
  name: string;
  alias: string;
  record: string | null;
  ppg: number | null;
  conference: string | null;
};

// Walks the standings tree. Team entries are recognized directly (they carry
// id/market/wins/losses/points_for together, per SportRadar's documented
// schema) and are matched and returned BEFORE their own fields are examined,
// so a team's own name is never mistaken for a conference name. Conference
// names are only picked up when descending through a key actually called
// "conference"/"conferences", not any nested object that happens to have a
// "name" field (e.g. division) -- that's what keeps conference tagging
// accurate rather than a best-guess.
function collectStandingsEntries(node: any, out: TeamStat[], conferenceName: string | null) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n) => collectStandingsEntries(n, out, conferenceName));
    return;
  }
  if (
    node.id &&
    node.market &&
    node.wins !== undefined &&
    node.losses !== undefined &&
    node.points_for !== undefined
  ) {
    const wins = node.wins ?? 0;
    const losses = node.losses ?? 0;
    const ties = node.ties ?? 0;
    const gamesPlayed = wins + losses + ties;
    const ppg = gamesPlayed > 0 ? Math.round((node.points_for / gamesPlayed) * 10) / 10 : null;
    out.push({
      id: node.id,
      market: node.market,
      name: node.name ?? "",
      alias: node.alias ?? "",
      record: ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`,
      ppg,
      conference: conferenceName,
    });
    return;
  }

  for (const key of Object.keys(node)) {
    const child = node[key];
    if (/^conferences?$/i.test(key)) {
      const list = Array.isArray(child) ? child : [child];
      for (const conf of list) {
        const confName =
          conf && typeof conf === "object" && typeof conf.name === "string"
            ? conf.name
            : conferenceName;
        collectStandingsEntries(conf, out, confName);
      }
    } else {
      collectStandingsEntries(child, out, conferenceName);
    }
  }
}

async function fetchStandings(apiKey: string, warnings: string[]): Promise<TeamStat[]> {
  try {
    const year = new Date().getFullYear();
    const res = await fetch(
      sportradarUrl(`/seasons/${year}/REG/standings/season.json`, apiKey),
      { cache: "no-store" }
    );
    if (!res.ok) {
      warnings.push(`SportRadar standings returned ${res.status}`);
      return [];
    }
    const data = await res.json();
    const out: TeamStat[] = [];
    collectStandingsEntries(data, out, null);
    if (out.length === 0) warnings.push("Parsed 0 teams from SportRadar standings response");
    return out;
  } catch (e: any) {
    warnings.push(`SportRadar standings fetch failed: ${e?.message ?? e}`);
    return [];
  }
}

// Build normalized-name -> team GUID map from the standings team list.
// Same "only unique keys" safety rule as before: an ambiguous name is
// dropped rather than guessed, so two similarly-named teams can never
// shadow each other.
function buildTeamIdMap(teams: TeamStat[]): Map<string, string> {
  const keyCounts = new Map<string, number>();
  const candidates: Array<[string, string]> = [];
  for (const t of teams) {
    const keys = new Set(
      [`${t.market} ${t.name}`, t.market, t.alias].map(normalizeTeamName).filter((k) => k.length > 0)
    );
    for (const k of keys) {
      candidates.push([k, t.id]);
      keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1);
    }
  }
  const map = new Map<string, string>();
  for (const [key, id] of candidates) {
    if (keyCounts.get(key) === 1) map.set(key, id);
  }
  return map;
}

function lookupTeamId(teamName: string, idMap: Map<string, string>): string | null {
  return idMap.get(normalizeTeamName(teamName)) ?? null;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const oddsApiKey = process.env.ODDS_API_KEY;
  if (!oddsApiKey) {
    return NextResponse.json(
      { error: "ODDS_API_KEY is not set in your environment variables." },
      { status: 500 }
    );
  }
  const sportradarKey = process.env.SPORTRADAR_API_KEY;

  const warnings: string[] = [];
  if (!sportradarKey) {
    warnings.push("SPORTRADAR_API_KEY is not set -- rankings and stats will be skipped.");
  }

  const oddsUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds/?apiKey=${oddsApiKey}&regions=us&markets=spreads&oddsFormat=american`;

  const oddsPromise = fetch(oddsUrl, { cache: "no-store" });

  // The two SportRadar calls are run one after another rather than in
  // parallel -- trial-tier keys are commonly limited to ~1 request/second,
  // and this is only ever called once per admin click, so the extra second
  // is a fine trade for not tripping a rate limit.
  let standings: TeamStat[] = [];
  let rankMap = new Map<string, number>();
  if (sportradarKey) {
    standings = await fetchStandings(sportradarKey, warnings);
    rankMap = await fetchApRankings(sportradarKey, warnings);
  }

  const oddsRes = await oddsPromise;
  if (!oddsRes.ok) {
    const text = await oddsRes.text();
    return NextResponse.json(
      { error: `Odds API error (${oddsRes.status}): ${text}` },
      { status: 502 }
    );
  }

  const raw = await oddsRes.json();
  const teamIdMap = buildTeamIdMap(standings);
  const statsById = new Map(standings.map((t) => [t.id, t]));

  let matchedCount = 0;
  const games = (raw as any[]).map((g) => {
    let spread = 0;
    const book = g.bookmakers?.[0];
    const market = book?.markets?.find((m: any) => m.key === "spreads");
    const homeOutcome = market?.outcomes?.find((o: any) => o.name === g.home_team);
    if (homeOutcome && typeof homeOutcome.point === "number") {
      spread = homeOutcome.point;
    }

    const homeId = lookupTeamId(g.home_team, teamIdMap);
    const awayId = lookupTeamId(g.away_team, teamIdMap);
    if (homeId) matchedCount++;
    if (awayId) matchedCount++;
    const homeStat = homeId ? statsById.get(homeId) : undefined;
    const awayStat = awayId ? statsById.get(awayId) : undefined;

    return {
      external_id: g.id,
      home_team: g.home_team,
      away_team: g.away_team,
      spread,
      kickoff_time: g.commence_time,
      home_rank: homeId ? rankMap.get(homeId) ?? null : null,
      away_rank: awayId ? rankMap.get(awayId) ?? null : null,
      home_record: homeStat?.record ?? null,
      away_record: awayStat?.record ?? null,
      home_ppg: homeStat?.ppg ?? null,
      away_ppg: awayStat?.ppg ?? null,
      home_conference: homeStat?.conference ?? null,
      away_conference: awayStat?.conference ?? null,
    };
  });

  if (sportradarKey && teamIdMap.size === 0) warnings.push("Built 0 usable team-name keys from SportRadar standings");
  if (sportradarKey && matchedCount === 0 && games.length > 0)
    warnings.push("Matched 0 odds-API team names to a SportRadar team ID -- naming convention may differ");

  return NextResponse.json({
    games,
    debug: {
      sportradarTeamsFetched: standings.length,
      teamKeysBuilt: teamIdMap.size,
      teamsRanked: rankMap.size,
      teamsWithStats: standings.length,
      oddsGamesMatchedToSportradar: matchedCount,
      oddsGamesTotal: games.length,
      warnings,
    },
  });
}
