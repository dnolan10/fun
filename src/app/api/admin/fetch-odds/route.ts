import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSportradarData, lookupTeamId } from "@/lib/sportradar";

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

  const { standings, rankMap, teamIdMap, statsById } = sportradarKey
    ? await getSportradarData(sportradarKey, warnings)
    : { standings: [], rankMap: new Map(), teamIdMap: new Map(), statsById: new Map() };

  const oddsRes = await oddsPromise;
  if (!oddsRes.ok) {
    const text = await oddsRes.text();
    return NextResponse.json(
      { error: `Odds API error (${oddsRes.status}): ${text}` },
      { status: 502 }
    );
  }

  const raw = await oddsRes.json();

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
