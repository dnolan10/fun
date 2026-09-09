import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSportradarData, lookupTeamId } from "@/lib/sportradar";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { week_id } = await request.json();
  if (week_id == null) {
    return NextResponse.json({ error: "week_id is required" }, { status: 400 });
  }

  const sportradarKey = process.env.SPORTRADAR_API_KEY;
  if (!sportradarKey) {
    return NextResponse.json({ error: "SPORTRADAR_API_KEY is not set" }, { status: 500 });
  }

  const { data: games, error: fetchError } = await supabase
    .from("games")
    .select("id, home_team, away_team")
    .eq("week_id", week_id);
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 400 });
  if (!games || games.length === 0) {
    return NextResponse.json({ error: "This week has no games yet" }, { status: 400 });
  }

  const warnings: string[] = [];
  const { rankMap, teamIdMap, statsById } = await getSportradarData(sportradarKey, warnings);

  let updatedCount = 0;
  let matchedCount = 0;
  for (const g of games) {
    const homeId = lookupTeamId(g.home_team, teamIdMap);
    const awayId = lookupTeamId(g.away_team, teamIdMap);
    if (homeId) matchedCount++;
    if (awayId) matchedCount++;
    const homeStat = homeId ? statsById.get(homeId) : undefined;
    const awayStat = awayId ? statsById.get(awayId) : undefined;

    const { error: updateError } = await supabase
      .from("games")
      .update({
        home_rank: homeId ? rankMap.get(homeId) ?? null : null,
        away_rank: awayId ? rankMap.get(awayId) ?? null : null,
        home_record: homeStat?.record ?? null,
        away_record: awayStat?.record ?? null,
        home_ppg: homeStat?.ppg ?? null,
        away_ppg: awayStat?.ppg ?? null,
      })
      .eq("id", g.id);

    if (updateError) {
      warnings.push(`Failed to update game ${g.id}: ${updateError.message}`);
    } else {
      updatedCount++;
    }
  }

  return NextResponse.json({
    ok: true,
    gamesUpdated: updatedCount,
    gamesTotal: games.length,
    teamNamesMatched: matchedCount,
    warnings,
  });
}
