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
async function fetchEspnTeams(): Promise<EspnTeam[]> {
  try {
    const res = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=300",
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const raw: any[] = [];
    collectObjectsWithKeys(data, ["id", "displayName", "abbreviation"], raw);
    return raw.map((t) => ({
      id: String(t.id),
      displayName: t.displayName ?? "",
      shortDisplayName: t.shortDisplayName ?? "",
      location: t.location ?? "",
    }));
  } catch {
    return [];
  }
}

// Build normalized-name -> ID map. Every candidate key (full display name,
// short display name, bare location/school name) is only included if it is
// UNIQUE across every team in the league -- if two teams would produce the
// same key, neither gets mapped, rather than risk one shadowing the other.
// This is what makes it impossible to repeat the earlier "every team named
// Texas gets the same rank" bug: ambiguous keys are dropped, never guessed.
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
async function fetchApRankings(): Promise<Map<string, number>> {
  const rankMap = new Map<string, number>();
  try {
    const res = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings",
      { cache: "no-store" }
    );
    if (!res.ok) return rankMap;
    const data = await res.json();

    // Prefer the AP poll specifically if multiple polls are present.
    const rankings = data.rankings as any[] | undefined;
    const apPoll = rankings?.find((r) => /AP Top 25|AP Poll/i.test(r?.name ?? "")) ?? rankings?.[0];

    const entries: any[] = [];
    collectObjectsWithKeys(apPoll?.ranks ?? apPoll, ["current", "team"], entries);

    for (const entry of entries) {
      const teamId = entry.team?.id != null ? String(entry.team.id) : null;
      if (teamId && typeof entry.current === "number") {
        rankMap.set(teamId, entry.current);
      }
    }
  } catch {
    // Rankings are a nice-to-have -- never let this block pulling odds.
  }
  return rankMap;
}

// ---- Step 3: record + points-per-game, keyed by ESPN team ID ----
type TeamStat = { record: string | null; ppg: number | null };

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

async function fetchTeamStats(): Promise<Map<string, TeamStat>> {
  const statsMap = new Map<string, TeamStat>();
  try {
    const year = new Date().getFullYear();
    const res = await fetch(
      `https://site.api.espn.com/apis/v2/sports/football/college-football/standings?season=${year}`,
      { cache: "no-store" }
    );
    if (!res.ok) return statsMap;
    const data = await res.json();
    const entries: any[] = [];
    collectObjectsWithKeys(data, ["team", "stats"], entries);

    for (const entry of entries) {
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
      statsMap.set(teamId, { record, ppg: ppg != null ? Math.round(ppg * 10) / 10 : null });
    }
  } catch {
    // Same deal -- best effort, never blocks the odds pull.
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

  const oddsUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds/?apiKey=${apiKey}&regions=us&markets=spreads&oddsFormat=american`;

  const [oddsRes, teams, rankMap, statsMap] = await Promise.all([
    fetch(oddsUrl, { cache: "no-store" }),
    fetchEspnTeams(),
    fetchApRankings(),
    fetchTeamStats(),
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
    };
  });

  return NextResponse.json({ games, teamsMatched: teamIdMap.size, teamsTotal: teams.length });
}
