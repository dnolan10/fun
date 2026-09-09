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

// ESPN's public endpoints sometimes reject requests that don't look like
// they're coming from a browser. Sending a normal User-Agent avoids that.
const ESPN_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json",
};

function normalizeTeamName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

// Generic recursive collector: finds every object in an arbitrarily-nested
// JSON blob that has ALL of the given keys. ESPN's public endpoints are
// unofficial and their exact nesting shifts around, so rather than hardcode
// a brittle path we search for the shape we need wherever it appears.
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

type EspnTeam = {
  id: string;
  displayName: string;
  shortDisplayName: string;
  location: string;
};

// ---- Step 1: the full team list, used only to resolve a name -> stable ID ----
async function fetchEspnTeams(warnings: string[]): Promise<EspnTeam[]> {
  try {
    const res = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=300",
      { cache: "no-store", headers: ESPN_HEADERS }
    );
    if (!res.ok) {
      warnings.push(`ESPN teams list returned ${res.status}`);
      return [];
    }
    const data = await res.json();
    const raw: any[] = [];
    collectObjectsWithKeys(data, ["id", "displayName", "abbreviation"], raw);
    if (raw.length === 0) warnings.push("ESPN teams list returned 0 teams (unexpected shape?)");
    return raw.map((t) => ({
      id: String(t.id),
      displayName: t.displayName ?? "",
      shortDisplayName: t.shortDisplayName ?? "",
      location: t.location ?? "",
    }));
  } catch (e: any) {
    warnings.push(`ESPN teams list fetch failed: ${e?.message ?? e}`);
    return [];
  }
}

// Build normalized-name -> ID map. Every candidate key (full display name,
// short display name, bare location/school name) is only included if it is
// UNIQUE across every team in the league -- if two teams would produce the
// same key, neither gets mapped, rather than risk one shadowing the other.
function buildTeamIdMap(teams: EspnTeam[]): Map<string, string> {
  const keyCounts = new Map<string, number>();
  const candidates: Array<[string, string]> = [];

  for (const t of teams) {
    const keys = new Set(
      [t.displayName, t.shortDisplayName, t.location]
        .map(normalizeTeamName)
        .filter((k) => k.length > 0)
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

// ---- Step 2: AP rankings, keyed by ESPN team ID ----
async function fetchApRankings(warnings: string[]): Promise<Map<string, number>> {
  const rankMap = new Map<string, number>();
  try {
    const res = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings",
      { cache: "no-store", headers: ESPN_HEADERS }
    );
    if (!res.ok) {
      warnings.push(`ESPN rankings returned ${res.status}`);
      return rankMap;
    }
    const data = await res.json();

    const rankings = data.rankings as any[] | undefined;
    const apPoll = rankings?.find((r) => /AP Top 25|AP Poll/i.test(r?.name ?? "")) ?? rankings?.[0];
    if (!apPoll) warnings.push("ESPN rankings response had no poll list (unexpected shape?)");

    const entries: any[] = [];
    collectObjectsWithKeys(apPoll?.ranks ?? apPoll, ["current", "team"], entries);

    for (const entry of entries) {
      const teamId = entry.team?.id != null ? String(entry.team.id) : null;
      if (teamId && typeof entry.current === "number") {
        rankMap.set(teamId, entry.current);
      }
    }
    if (rankMap.size === 0) warnings.push("Parsed 0 ranked teams from ESPN rankings response");
  } catch (e: any) {
    warnings.push(`ESPN rankings fetch failed: ${e?.message ?? e}`);
  }
  return rankMap;
}

// ---- Step 3: record, points-per-game, and conference -- all keyed by ESPN team ID ----
type TeamStat = { record: string | null; ppg: number | null; conference: string | null };

function statValue(entry: any, names: string[]): number | null {
  for (const n of names) {
    const s = entry.stats?.find((s: any) => s.name === n || s.abbreviation === n);
    if (s) {
      const v = typeof s.value === "number" ? s.value : parseFloat(s.displayValue);
      if (!Number.isNaN(v)) return v;
    }
  }
  return null;
}

// Walks the (conference-grouped) standings tree, tagging each team entry
// with the nearest ancestor group name it was found under -- that ancestor
// name is the conference (e.g. "Big Ten Conference"). Entries are matched
// and returned before their own fields are ever considered as a group name,
// so a team's own name/mascot can never be mistaken for a conference name.
function collectStandingsEntries(node: any, out: Array<{ entry: any; conference: string | null }>, conferenceName: string | null) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n) => collectStandingsEntries(n, out, conferenceName));
    return;
  }
  if (node.team && Array.isArray(node.stats)) {
    out.push({ entry: node, conference: conferenceName });
    return;
  }
  const nextConferenceName =
    typeof node.name === "string" && node.name.length > 0 ? node.name : conferenceName;
  for (const key of Object.keys(node)) {
    collectStandingsEntries(node[key], out, nextConferenceName);
  }
}

async function fetchTeamStats(warnings: string[]): Promise<Map<string, TeamStat>> {
  const statsMap = new Map<string, TeamStat>();
  try {
    const year = new Date().getFullYear();
    const res = await fetch(
      `https://site.api.espn.com/apis/v2/sports/football/college-football/standings?season=${year}`,
      { cache: "no-store", headers: ESPN_HEADERS }
    );
    if (!res.ok) {
      warnings.push(`ESPN standings returned ${res.status}`);
      return statsMap;
    }
    const data = await res.json();
    const collected: Array<{ entry: any; conference: string | null }> = [];
    collectStandingsEntries(data, collected, null);
    if (collected.length === 0) warnings.push("Parsed 0 standings entries (unexpected shape?)");

    for (const { entry, conference } of collected) {
      const teamId = entry.team?.id != null ? String(entry.team.id) : null;
      if (!teamId) continue;
      const wins = statValue(entry, ["wins"]);
      const losses = statValue(entry, ["losses"]);
      const pointsFor = statValue(entry, ["pointsFor", "totalPointsFor"]);
      const gamesPlayed = statValue(entry, ["gamesPlayed", "games"]);
      let ppg = statValue(entry, ["avgPointsFor", "pointsPerGame"]);
      if (ppg == null && pointsFor != null && gamesPlayed) {
        ppg = pointsFor / gamesPlayed;
      }
      const record = wins != null && losses != null ? `${wins}-${losses}` : null;
      statsMap.set(teamId, {
        record,
        ppg: ppg != null ? Math.round(ppg * 10) / 10 : null,
        conference: conference,
      });
    }
  } catch (e: any) {
    warnings.push(`ESPN standings fetch failed: ${e?.message ?? e}`);
  }
  return statsMap;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ODDS_API_KEY is not set in your environment variables." },
      { status: 500 }
    );
  }

  const warnings: string[] = [];
  const oddsUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds/?apiKey=${apiKey}&regions=us&markets=spreads&oddsFormat=american`;

  const [oddsRes, teams, rankMap, statsMap] = await Promise.all([
    fetch(oddsUrl, { cache: "no-store" }),
    fetchEspnTeams(warnings),
    fetchApRankings(warnings),
    fetchTeamStats(warnings),
  ]);

  if (!oddsRes.ok) {
    const text = await oddsRes.text();
    return NextResponse.json(
      { error: `Odds API error (${oddsRes.status}): ${text}` },
      { status: 502 }
    );
  }

  const raw = await oddsRes.json();
  const teamIdMap = buildTeamIdMap(teams);

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
    const homeStat = homeId ? statsMap.get(homeId) : undefined;
    const awayStat = awayId ? statsMap.get(awayId) : undefined;

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

  if (teamIdMap.size === 0) warnings.push("Built 0 usable team-name keys from the ESPN teams list");
  if (matchedCount === 0 && games.length > 0)
    warnings.push("Matched 0 odds-API team names to an ESPN team ID -- naming convention may differ");

  return NextResponse.json({
    games,
    debug: {
      espnTeamsFetched: teams.length,
      teamKeysBuilt: teamIdMap.size,
      teamsRanked: rankMap.size,
      teamsWithStats: statsMap.size,
      oddsGamesMatchedToEspn: matchedCount,
      oddsGamesTotal: games.length,
      warnings,
    },
  });
}
