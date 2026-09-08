import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PicksForm from "@/components/PicksForm";

export default async function PicksPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: week } = await supabase
    .from("weeks")
    .select("id, label")
    .eq("is_published", true)
    .order("week_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!week) {
    return <p className="text-mute">No week has been published yet — check back soon.</p>;
  }

  const { data: games } = await supabase
    .from("games")
    .select("id, home_team, away_team, spread, kickoff_time, is_tiebreaker")
    .eq("week_id", week.id)
    .order("kickoff_time", { ascending: true });

  const { data: existingPicks } = await supabase
    .from("picks")
    .select("game_id, picked_team, tiebreaker_guess")
    .eq("user_id", user.id);

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold text-ink">{week.label}</h1>
      <p className="mt-1 text-sm text-mute">
        Pick each game against the spread. Picks lock automatically at kickoff.
      </p>
      <div className="mt-6">
        <PicksForm
          userId={user.id}
          games={games ?? []}
          existingPicks={(existingPicks ?? []) as any}
        />
      </div>
    </div>
  );
}
