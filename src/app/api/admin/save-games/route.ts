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

  const { week_id, games, publish } = await request.json();

  if (!week_id || !Array.isArray(games) || games.length === 0) {
    return NextResponse.json({ error: "week_id and at least one game are required" }, { status: 400 });
  }

  const tiebreakerCount = games.filter((g: any) => g.is_tiebreaker).length;
  if (tiebreakerCount > 1) {
    return NextResponse.json({ error: "Only one game can be the tiebreaker" }, { status: 400 });
  }

  const rows = games.map((g: any) => ({
    week_id,
    home_team: g.home_team,
    away_team: g.away_team,
    spread: g.spread,
    kickoff_time: g.kickoff_time,
    is_tiebreaker: !!g.is_tiebreaker,
    external_id: g.external_id ?? null,
  }));

  const { error: insertError } = await supabase.from("games").insert(rows);
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });

  if (publish) {
    const { error: publishError } = await supabase
      .from("weeks")
      .update({ is_published: true })
      .eq("id", week_id);
    if (publishError) return NextResponse.json({ error: publishError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
