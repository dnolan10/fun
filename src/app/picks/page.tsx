import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PicksForm from "@/components/PicksForm";
import WeekSelector from "@/components/WeekSelector";
import { sortByRankThenSpread } from "@/lib/scoring";

export default async function PicksPage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: weeks } = await supabase
    .from("weeks")
    .select("id, label")
    .eq("is_published", true)
    .order("week_number", { ascending: false });

  if (!weeks || weeks.length === 0) {
    return <p className="text-mute">No week has been published yet — check back soon.</p>;
  }

  const requestedId = searchParams.week ? Number(searchParams.week) : null;
  const week = weeks.find((w) => w.id === requestedId) ?? weeks[0];

  const { data: games } = await supabase
    .from("games")
    .select(
      "id, home_team, away_team, spread, kickoff_time, is_tiebreaker, home_rank, away_rank, home_record, away_record, home_ppg, away_ppg, home_score, away_score, is_final"
    )
    .eq("week_id", week.id);

  const sortedGames = sortByRankThenSpread(games ?? []);

  const { data: existingPicks } = await supabase
    .from("picks")
    .select("game_id, picked_team, tiebreaker_guess")
    .eq("user_id", user.id);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold text-ink">{week.label}</h1>
        {weeks.length > 1 && <WeekSelector weeks={weeks} selectedWeekId={week.id} />}
      </div>
      <p className="mt-1 text-sm text-mute">
        Pick each game against the spread. Picks lock automatically at kickoff.
      </p>
      <div className="mt-6">
        <PicksForm
          userId={user.id}
          games={sortedGames}
          existingPicks={(existingPicks ?? []) as any}
        />
      </div>
    </div>
  );
}
