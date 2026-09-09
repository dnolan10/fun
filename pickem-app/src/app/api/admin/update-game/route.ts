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

  const { game_id, spread, kickoff_time, is_tiebreaker } = await request.json();
  if (game_id == null) {
    return NextResponse.json({ error: "game_id is required" }, { status: 400 });
  }

  // Only one tiebreaker per week -- if this game is being made the
  // tiebreaker, clear the flag off every other game in the same week first.
  if (is_tiebreaker === true) {
    const { data: game } = await supabase
      .from("games")
      .select("week_id")
      .eq("id", game_id)
      .single();
    if (game) {
      await supabase
        .from("games")
        .update({ is_tiebreaker: false })
        .eq("week_id", game.week_id)
        .neq("id", game_id);
    }
  }

  const updates: Record<string, unknown> = {};
  if (spread !== undefined) updates.spread = spread;
  if (kickoff_time !== undefined) updates.kickoff_time = kickoff_time;
  if (is_tiebreaker !== undefined) updates.is_tiebreaker = is_tiebreaker;

  const { error } = await supabase.from("games").update(updates).eq("id", game_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
