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

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `Odds API error (${res.status}): ${text}` },
      { status: 502 }
    );
  }

  const raw = await res.json();

  const games = (raw as any[]).map((g) => {
    let spread = 0;
    const book = g.bookmakers?.[0];
    const market = book?.markets?.find((m: any) => m.key === "spreads");
    const homeOutcome = market?.outcomes?.find((o: any) => o.name === g.home_team);
    if (homeOutcome && typeof homeOutcome.point === "number") {
      spread = homeOutcome.point;
    }
    return {
      external_id: g.id,
      home_team: g.home_team,
      away_team: g.away_team,
      spread,
      kickoff_time: g.commence_time,
    };
  });

  return NextResponse.json({ games });
}
