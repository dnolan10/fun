// Shared by the admin "Fetch final scores automatically" button and the
// scheduled cron job -- both just need a Supabase client with permission to
// write to `games` (a user-session client for the admin, a service-role
// client for the cron job, since a cron request has no logged-in user).
export type ScoreSyncResult = {
  ok: true;
  gamesUpdated: number;
  gamesChecked: number;
  gamesStillInProgress: number;
  gamesNeedingManualEntry: number;
  warnings: string[];
};

export async function syncFinalScores(supabase: any): Promise<ScoreSyncResult | { error: string; status: number }> {
  const oddsApiKey = process.env.ODDS_API_KEY;
  if (!oddsApiKey) {
    return { error: "ODDS_API_KEY is not set", status: 500 };
  }

  const { data: games, error: fetchError } = await supabase
    .from("games")
    .select("id, home_team, away_team, external_id")
    .eq("is_final", false);
  if (fetchError) return { error: fetchError.message, status: 400 };

  const pending = (games ?? []).filter((g: any) => g.external_id);
  const gamesNeedingManualEntry = (games ?? []).length - pending.length;

  if (pending.length === 0) {
    return {
      ok: true,
      gamesUpdated: 0,
      gamesChecked: 0,
      gamesStillInProgress: 0,
      gamesNeedingManualEntry,
      warnings: [],
    };
  }

  // The Odds API only returns completed games from the last few days --
  // daysFrom=3 is the max the API allows, which comfortably covers a
  // Thursday-through-Monday slate checked any day that same week.
  const scoresUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/scores/?apiKey=${oddsApiKey}&daysFrom=3`;
  const res = await fetch(scoresUrl, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    return { error: `Odds API error (${res.status}): ${text}`, status: 502 };
  }
  const events = (await res.json()) as any[];
  const eventById = new Map(events.map((e) => [e.id, e]));

  let updatedCount = 0;
  let stillInProgress = 0;
  const warnings: string[] = [];

  for (const g of pending) {
    const event = eventById.get(g.external_id);
    const label = `${g.away_team} @ ${g.home_team}`;

    if (!event) {
      warnings.push(`${label}: not in the Odds API's results yet (may be more than 3 days old).`);
      continue;
    }
    if (!event.completed || !Array.isArray(event.scores)) {
      stillInProgress++;
      continue;
    }

    const homeEntry = event.scores.find((s: any) => s.name === event.home_team);
    const awayEntry = event.scores.find((s: any) => s.name === event.away_team);
    if (!homeEntry || !awayEntry) {
      warnings.push(`${label}: couldn't match team names in the scores response.`);
      continue;
    }

    const homeScore = Number(homeEntry.score);
    const awayScore = Number(awayEntry.score);
    if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) {
      warnings.push(`${label}: score wasn't a number.`);
      continue;
    }

    const { error: updateError } = await supabase
      .from("games")
      .update({ home_score: homeScore, away_score: awayScore, is_final: true })
      .eq("id", g.id);

    if (updateError) {
      warnings.push(`${label}: save failed -- ${updateError.message}`);
    } else {
      updatedCount++;
    }
  }

  return {
    ok: true,
    gamesUpdated: updatedCount,
    gamesChecked: pending.length,
    gamesStillInProgress: stillInProgress,
    gamesNeedingManualEntry,
    warnings,
  };
}
