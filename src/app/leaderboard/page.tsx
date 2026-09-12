import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Avatar from "@/components/Avatar";
import WeeklyWinnerBanner from "@/components/WeeklyWinnerBanner";
import { getAllUserRecords } from "@/lib/records";
import { formatRecord } from "@/lib/scoring";
import { computeBotStandings, type BotGame } from "@/lib/bots";

function BotBadge({ emoji }: { emoji: string }) {
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface2 text-xs ring-1 ring-line">
      {emoji}
    </span>
  );
}

type Row = {
  key: string;
  isBot: boolean;
  name: string;
  points: number;
  recordLabel: string;
  avatarNode: React.ReactNode;
  note?: string | null;
};

export default async function LeaderboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_type, avatar_emoji, avatar_color, avatar_url");

  const { data: cumulative } = await supabase.from("cumulative_scores").select("user_id, total_points");
  const cumByUser = new Map((cumulative ?? []).map((c: any) => [c.user_id, c.total_points]));

  const { data: weeks } = await supabase
    .from("weeks")
    .select("id, label, week_number")
    .eq("is_published", true)
    .order("week_number", { ascending: false });

  const recordByUser = await getAllUserRecords(supabase);

  // All final games in published weeks -- the data bots "pick" against.
  const { data: finalGamesRaw } = await supabase
    .from("games")
    .select("id, spread, home_score, away_score, is_final, week_id, weeks!inner(is_published)")
    .eq("is_final", true)
    .eq("weeks.is_published", true);
  const allFinalGames: (BotGame & { week_id: number })[] = (finalGamesRaw ?? []).map((g: any) => ({
    id: g.id,
    spread: g.spread,
    home_score: g.home_score,
    away_score: g.away_score,
    is_final: g.is_final,
    week_id: g.week_id,
  }));

  // Every pool member shows up here, even at 0-0 -- previously only users
  // with at least one scored pick appeared at all, which made a brand new
  // member look like they hadn't joined.
  const seasonUserRows: Row[] = (profiles ?? []).map((p: any) => {
    const rec = recordByUser.get(p.id) ?? { wins: 0, losses: 0, pushes: 0 };
    const recordLabel = formatRecord(rec);
    return {
      key: p.id,
      isBot: false,
      name: p.display_name ?? "Someone",
      points: cumByUser.get(p.id) ?? 0,
      recordLabel,
      avatarNode: <Avatar profile={p} size="sm" title={`${p.display_name} (${recordLabel})`} />,
    };
  });
  const seasonBotRows: Row[] = computeBotStandings(allFinalGames).map((b) => ({
    key: b.id,
    isBot: true,
    name: b.name,
    points: b.points,
    recordLabel: formatRecord(b.record),
    avatarNode: <BotBadge emoji={b.emoji} />,
  }));
  const seasonRows = [...seasonUserRows, ...seasonBotRows].sort((a, b) => b.points - a.points);

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

    const tbByUser = new Map((tiebreakerResults ?? []).map((t: any) => [t.user_id, t]));

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

    // The most recent fully-final published week gets the champion banner
    // (human players only -- bots don't get the bragging rights banner).
    if (!champBanner && ranked.length > 0) {
      const { data: weekGames } = await supabase.from("games").select("is_final").eq("week_id", week.id);
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

    const weekUserRows: Row[] = ranked.map((row: any) => {
      const rec = recordByUser.get(row.user_id) ?? { wins: 0, losses: 0, pushes: 0 };
      const name = row.profiles?.display_name ?? "Someone";
      return {
        key: row.user_id,
        isBot: false,
        name,
        points: row.points,
        recordLabel: formatRecord(rec),
        avatarNode: <Avatar profile={row.profiles} size="sm" title={`${name} (${formatRecord(rec)} season)`} />,
        note: row.tiebreakerDiff != null ? `(tiebreaker off by ${row.tiebreakerDiff})` : null,
      };
    });
    const weekFinalGames = allFinalGames.filter((g) => g.week_id === week.id);
    const weekBotRows: Row[] = computeBotStandings(weekFinalGames).map((b) => ({
      key: b.id,
      isBot: true,
      name: b.name,
      points: b.points,
      recordLabel: formatRecord(b.record),
      avatarNode: <BotBadge emoji={b.emoji} />,
    }));
    const combined = [...weekUserRows, ...weekBotRows].sort((a, b) => b.points - a.points);

    weekBlocks.push({ week, rows: combined });
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
        <p className="mt-1 text-xs text-mute">🤖 bots play every game with a fixed strategy, for comparison.</p>
        <div className="mt-3 divide-y divide-line rounded border border-line bg-surface">
          {seasonRows.length === 0 && <p className="p-4 text-sm text-mute">No scores yet.</p>}
          {seasonRows.map((row, i) => (
            <div key={row.key} className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="shrink-0 w-5 text-mute">{i + 1}</span>
                {row.avatarNode}
                <span className={`truncate ${row.isBot ? "text-mute" : "text-ink"}`}>{row.name}</span>
                <span className="shrink-0 text-xs text-mute">{row.recordLabel}</span>
              </div>
              <span className="shrink-0 font-display text-lg text-orange">{row.points}</span>
            </div>
          ))}
        </div>
      </section>

      {weekBlocks.map(({ week, rows }) => (
        <section key={week.id} className="mt-8">
          <h2 className="font-display text-lg text-ink">{week.label}</h2>
          <div className="mt-3 divide-y divide-line rounded border border-line bg-surface">
            {rows.length === 0 && <p className="p-4 text-sm text-mute">No results yet.</p>}
            {rows.map((row, i) => (
              <div key={row.key} className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0 w-5 text-mute">{i === 0 ? "🏆" : i + 1}</span>
                  {row.avatarNode}
                  <span className={`truncate ${row.isBot ? "text-mute" : "text-ink"}`}>{row.name}</span>
                  {row.note && <span className="hidden shrink-0 text-xs text-mute sm:inline">{row.note}</span>}
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
