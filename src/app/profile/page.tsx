import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileForm from "@/components/ProfileForm";
import { atsResult, currentStreak } from "@/lib/scoring";

export default async function ProfilePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_type, avatar_emoji, avatar_color, avatar_url")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const { data: historyRows } = await supabase
    .from("picks")
    .select("picked_team, games!inner(spread, home_score, away_score, is_final, kickoff_time)")
    .eq("user_id", user.id)
    .eq("games.is_final", true)
    .order("kickoff_time", { foreignTable: "games", ascending: false });

  const results = (historyRows ?? []).map((r: any) => atsResult(r.games, r.picked_team));
  const correct = results.filter((r) => r === "correct").length;
  const incorrect = results.filter((r) => r === "incorrect").length;
  const pushes = results.filter((r) => r === "push").length;
  const decided = correct + incorrect;
  const winPct = decided > 0 ? Math.round((correct / decided) * 1000) / 10 : null;
  const streak = currentStreak(results as ("correct" | "incorrect" | "push")[]);

  const { data: weeklyPoints } = await supabase
    .from("weekly_scores")
    .select("points, weeks(label, week_number)")
    .eq("user_id", user.id)
    .order("points", { ascending: false });

  const bestWeek = (weeklyPoints ?? [])[0] as any;

  return (
    <div className="max-w-lg">
      <h1 className="font-display text-3xl font-semibold text-ink">Your icon &amp; stats</h1>

      <section className="mt-6">
        <ProfileForm userId={user.id} profile={profile} />
      </section>

      <section className="mt-8 rounded border border-line bg-surface p-4">
        <h2 className="font-display text-lg text-orange">Season record</h2>
        {decided + pushes === 0 ? (
          <p className="mt-2 text-sm text-mute">No finished games yet this season.</p>
        ) : (
          <div className="mt-2 space-y-1 text-sm text-ink">
            <p>
              {correct}-{incorrect}
              {pushes > 0 ? `-${pushes}` : ""} against the spread
              {winPct != null && <span className="text-mute"> ({winPct}%)</span>}
            </p>
            {streak !== 0 && (
              <p>
                {streak > 0 ? (
                  <span className="text-win">🔥 {streak} correct in a row</span>
                ) : (
                  <span className="text-loss">❄️ {Math.abs(streak)} missed in a row</span>
                )}
              </p>
            )}
            {bestWeek && (
              <p className="text-mute">
                Best week: {bestWeek.weeks?.label ?? `Week ${bestWeek.weeks?.week_number}`} — {bestWeek.points}{" "}
                pts
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
