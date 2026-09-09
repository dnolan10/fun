import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function LeaderboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cumulative } = await supabase
    .from("cumulative_scores")
    .select("user_id, total_points, profiles(display_name)")
    .order("total_points", { ascending: false });

  const { data: weeks } = await supabase
    .from("weeks")
    .select("id, label, week_number")
    .eq("is_published", true)
    .order("week_number", { ascending: false });

  const weekBlocks = [];
  for (const week of weeks ?? []) {
    const { data: scores } = await supabase
      .from("weekly_scores")
      .select("user_id, points, profiles(display_name)")
      .eq("week_id", week.id)
      .order("points", { ascending: false });

    const { data: tiebreakerResults } = await supabase
      .from("pick_results")
      .select("user_id, tiebreaker_guess, actual_total")
      .eq("week_id", week.id)
      .eq("is_tiebreaker", true);

    const tbByUser = new Map(
      (tiebreakerResults ?? []).map((t: any) => [t.user_id, t])
    );

    const ranked = (scores ?? [])
      .map((s: any) => {
        const tb = tbByUser.get(s.user_id);
        const diff =
          tb && tb.actual_total != null && tb.tiebreaker_guess != null
            ? Math.abs(tb.tiebreaker_guess - tb.actual_total)
            : null;
        return { ...s, tiebreakerDiff: diff };
      })
      .sort((a: any, b: any) => {
        if (b.points !== a.points) return b.points - a.points;
        if (a.tiebreakerDiff == null) return 1;
        if (b.tiebreakerDiff == null) return -1;
        return a.tiebreakerDiff - b.tiebreakerDiff;
      });

    weekBlocks.push({ week, ranked });
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold text-ink">Standings</h1>

      <section className="mt-6">
        <h2 className="font-display text-lg text-orange">Season</h2>
        <div className="mt-3 divide-y divide-line rounded border border-line bg-surface">
          {(cumulative ?? []).length === 0 && (
            <p className="p-4 text-sm text-mute">No scores yet.</p>
          )}
          {(cumulative ?? []).map((row: any, i: number) => (
            <div key={row.user_id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="w-5 text-mute">{i + 1}</span>
                <span className="text-ink">{row.profiles?.display_name}</span>
              </div>
              <span className="font-display text-lg text-orange">{row.total_points}</span>
            </div>
          ))}
        </div>
      </section>

      {weekBlocks.map(({ week, ranked }) => (
        <section key={week.id} className="mt-8">
          <h2 className="font-display text-lg text-ink">{week.label}</h2>
          <div className="mt-3 divide-y divide-line rounded border border-line bg-surface">
            {ranked.length === 0 && <p className="p-4 text-sm text-mute">No results yet.</p>}
            {ranked.map((row: any, i: number) => (
              <div key={row.user_id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="w-5 text-mute">{i === 0 ? "🏆" : i + 1}</span>
                  <span className="text-ink">{row.profiles?.display_name}</span>
                  {row.tiebreakerDiff != null && (
                    <span className="text-xs text-mute">
                      (tiebreaker off by {row.tiebreakerDiff})
                    </span>
                  )}
                </div>
                <span className="text-ink">{row.points} pts</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
