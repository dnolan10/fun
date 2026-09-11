import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Avatar from "@/components/Avatar";
import WeeklyWinnerBanner from "@/components/WeeklyWinnerBanner";

export default async function LeaderboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cumulative } = await supabase
    .from("cumulative_scores")
    .select("user_id, total_points, profiles(display_name, avatar_type, avatar_emoji, avatar_color, avatar_url)")
    .order("total_points", { ascending: false });

  const { data: weeks } = await supabase
    .from("weeks")
    .select("id, label, week_number")
    .eq("is_published", true)
    .order("week_number", { ascending: false });

  const weekBlocks = [];
  let champBanner: { weekLabel: string; points: number; champions: string[] } | null = null;

  for (const week of weeks ?? []) {
    const { data: scores } = await supabase
      .from("weekly_scores")
      .select("user_id, points, profiles(display_name, avatar_type, avatar_emoji, avatar_color, avatar_url)")
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

    // The most recent fully-final published week gets the champion banner.
    if (!champBanner && ranked.length > 0) {
      const { data: weekGames } = await supabase
        .from("games")
        .select("is_final")
        .eq("week_id", week.id);
      const allFinal = (weekGames ?? []).length > 0 && (weekGames ?? []).every((g) => g.is_final);
      if (allFinal) {
        const top = ranked[0];
        const champions = ranked
          .filter((r: any) => r.points === top.points && r.tiebreakerDiff === top.tiebreakerDiff)
          .map((r: any) => r.profiles?.display_name)
          .filter(Boolean);
        champBanner = { weekLabel: week.label, points: top.points, champions };
      }
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold text-ink">Standings</h1>

      {champBanner && (
        <div className="mt-4">
          <WeeklyWinnerBanner
            weekLabel={champBanner.weekLabel}
            points={champBanner.points}
            champions={champBanner.champions}
          />
        </div>
      )}

      <section className="mt-6">
        <h2 className="font-display text-lg text-orange">Season</h2>
        <div className="mt-3 divide-y divide-line rounded border border-line bg-surface">
          {(cumulative ?? []).length === 0 && (
            <p className="p-4 text-sm text-mute">No scores yet.</p>
          )}
          {(cumulative ?? []).map((row: any, i: number) => (
            <div key={row.user_id} className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="shrink-0 w-5 text-mute">{i + 1}</span>
                <Avatar profile={row.profiles} size="sm" />
                <span className="truncate text-ink">{row.profiles?.display_name}</span>
              </div>
              <span className="shrink-0 font-display text-lg text-orange">{row.total_points}</span>
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
              <div key={row.user_id} className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0 w-5 text-mute">{i === 0 ? "🏆" : i + 1}</span>
                  <Avatar profile={row.profiles} size="sm" />
                  <span className="truncate text-ink">{row.profiles?.display_name}</span>
                  {row.tiebreakerDiff != null && (
                    <span className="hidden shrink-0 text-xs text-mute sm:inline">
                      (tiebreaker off by {row.tiebreakerDiff})
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-ink">{row.points} pts</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
