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

async function fetchApRankings(): Promise<Map<string, number>> {
  const rankMap = new Map<string, number>();
  try {
    const res = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings",
      { cache: "no-store" }
    );
    if (!res.ok) return rankMap;
    const data = await res.json();
    const apPoll =
      (data.rankings as any[])?.find((r) => /AP Top 25|AP Poll/i.test(r.name ?? "")) ??
      data.rankings?.[0];
    for (const entry of apPoll?.ranks ?? []) {
      const displayName = normalizeTeamName(entry.team?.displayName ?? "");
      const location = normalizeTeamName(entry.team?.location ?? "");
      if (displayName) rankMap.set(displayName, entry.current);
      if (location) rankMap.set(location, entry.current);
    }
  } catch {
    // Rankings are a nice-to-have; if ESPN's endpoint is unreachable we just
    // return no ranks rather than failing the whole odds fetch.
  }
  return rankMap;
}

function lookupRank(teamName: string, rankMap: Map<string, number>): number | null {
  const norm = normalizeTeamName(teamName);
  if (rankMap.has(norm)) return rankMap.get(norm)!;
  for (const [key, rank] of rankMap.entries()) {
    if (norm.includes(key) || key.includes(norm)) return rank;
  }
  return null;
}

function findEntriesRecursive(node: any, out: any[]) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n) => findEntriesRecursive(n, out));
    return;
  }
  if (node.team && Array.isArray(node.stats)) {
    out.push(node);
  }
  for (const key of Object.keys(node)) {
    findEntriesRecursive(node[key], out);
  }
}

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

type TeamStat = { record: string | null; ppg: number | null };

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
    findEntriesRecursive(data, entries);

    for (const entry of entries) {
      const displayName = normalizeTeamName(entry.team?.displayName ?? "");
      const location = normalizeTeamName(entry.team?.location ?? "");
      const wins = statValue(entry, ["wins"]);
      const losses = statValue(entry, ["losses"]);
      const pointsFor = statValue(entry, ["pointsFor"]);
      const gamesPlayed = statValue(entry, ["gamesPlayed"]);
      let ppg = statValue(entry, ["avgPointsFor"]);
      if (ppg == null && pointsFor != null && gamesPlayed) {
        ppg = pointsFor / gamesPlayed;
      }
      const record = wins != null && losses != null ? `${wins}-${losses}` : null;
      const stat: TeamStat = { record, ppg: ppg != null ? Math.round(ppg * 10) / 10 : null };
      if (displayName) statsMap.set(displayName, stat);
      if (location) statsMap.set(location, stat);
    }
  } catch {
    // Best-effort only -- an unavailable stats endpoint should never break
    // pulling odds, so we just return whatever we managed to collect.
  }
  return statsMap;
}

function lookupTeamStat(teamName: string, statsMap: Map<string, TeamStat>): TeamStat {
  const norm = normalizeTeamName(teamName);
  if (statsMap.has(norm)) return statsMap.get(norm)!;
  for (const [key, stat] of statsMap.entries()) {
    if (norm.includes(key) || key.includes(norm)) return stat;
  }
  return { record: null, ppg: null };
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

  const url = `https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds/?apiKey=${apiKey}&regions=us&markets=spreads&oddsFormat=american`;

  const [oddsRes, rankMap, statsMap] = await Promise.all([
    fetch(url, { cache: "no-store" }),
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

  const games = (raw as any[]).map((g) => {
    let spread = 0;
    const book = g.bookmakers?.[0];
    const market = book?.markets?.find((m: any) => m.key === "spreads");
    const homeOutcome = market?.outcomes?.find((o: any) => o.name === g.home_team);
    if (homeOutcome && typeof homeOutcome.point === "number") {
      spread = homeOutcome.point;
    }
    const homeStat = lookupTeamStat(g.home_team, statsMap);
    const awayStat = lookupTeamStat(g.away_team, statsMap);
    return {
      external_id: g.id,
      home_team: g.home_team,
      away_team: g.away_team,
      spread,
      kickoff_time: g.commence_time,
      home_rank: lookupRank(g.home_team, rankMap),
      away_rank: lookupRank(g.away_team, rankMap),
      home_record: homeStat.record,
      away_record: awayStat.record,
      home_ppg: homeStat.ppg,
      away_ppg: awayStat.ppg,
    };
  });

  return NextResponse.json({ games });
}
