import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  if (!profile?.is_admin)
    return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { game_id, home_score, away_score } = await request.json();

  if (game_id == null || home_score == null || away_score == null) {
    return NextResponse.json({ error: "game_id, home_score, and away_score are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("games")
    .update({ home_score, away_score, is_final: true })
    .eq("id", game_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Scoring (ATS winner, points, weekly/cumulative totals) is computed
  // automatically by the game_ats_winner / pick_results / weekly_scores /
  // cumulative_scores views in Postgres — nothing else to do here.
  return NextResponse.json({ ok: true });
}
