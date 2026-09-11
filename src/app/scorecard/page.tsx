import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import WeekSelector from "@/components/WeekSelector";
import Avatar, { type AvatarProfile } from "@/components/Avatar";
import { atsMargin, atsResult, formatSpread, isCloseCall, isLocked, rankLabel } from "@/lib/scoring";

type Game = {
  id: number;
  home_team: string;
  away_team: string;
  spread: number;
  kickoff_time: string;
  is_tiebreaker: boolean;
  home_rank: number | null;
  away_rank: number | null;
  home_score: number | null;
  away_score: number | null;
  is_final: boolean;
};

type PickRow = {
  game_id: number;
  picked_team: "home" | "away";
  tiebreaker_guess: number | null;
  user_id: string;
  profiles: AvatarProfile;
};

export default async function ScorecardPage({
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
      "id, home_team, away_team, spread, kickoff_time, is_tiebreaker, home_rank, away_rank, home_score, away_score, is_final"
    )
    .eq("week_id", week.id);

  const sortedGames = ([...(games ?? [])] as Game[]).sort(
    (a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()
  );

  const gameIds = sortedGames.map((g) => g.id);
  let pickRows: PickRow[] = [];
  if (gameIds.length) {
    const { data } = await supabase
      .from("picks")
      .select(
        "game_id, picked_team, tiebreaker_guess, user_id, profiles(display_name, avatar_type, avatar_emoji, avatar_color, avatar_url)"
      )
      .in("game_id", gameIds);
    pickRows = (data ?? []) as any as PickRow[];
  }

  const picksByGame = new Map<number, PickRow[]>();
  for (const p of pickRows) {
    const list = picksByGame.get(p.game_id) ?? [];
    list.push(p);
    picksByGame.set(p.game_id, list);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold text-ink">{week.label} Scorecard</h1>
        {weeks.length > 1 && <WeekSelector weeks={weeks} selectedWeekId={week.id} basePath="/scorecard" />}
      </div>
      <p className="mt-1 text-xs text-mute">
        Icons show who&apos;s on each side once a game locks —{" "}
        <span className="text-tan">tan ring</span> = covered the spread,{" "}
        <span className="text-loss">red ring</span> = missed it.
      </p>

      <div className="mt-4 space-y-2">
        {sortedGames.length === 0 && <p className="text-sm text-mute">No games this week.</p>}

        {sortedGames.map((g) => {
          const locked = isLocked(g.kickoff_time);
          const picks = picksByGame.get(g.id) ?? [];
          const awayPicks = picks.filter((p) => p.picked_team === "away");
          const homePicks = picks.filter((p) => p.picked_team === "home");

          const status = g.is_final
            ? "Final"
            : locked
            ? "In progress / awaiting result"
            : `Kicks off ${new Date(g.kickoff_time).toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}`;

          return (
            <div
              key={g.id}
              className={`rounded border p-3 ${
                g.is_tiebreaker ? "border-orange/50 bg-orange/5" : "border-line bg-surface"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-mute">
                <span>{status}</span>
                <div className="flex items-center gap-2">
                  {g.is_final && isCloseCall(g) && (
                    <span className="rounded-full bg-loss/20 px-2 py-0.5 text-[10px] font-medium text-loss">
                      🔥 Close call{(() => {
                        const margin = atsMargin(g);
                        return margin === 0 ? " — push" : ` — by ${Math.abs(margin!)}`;
                      })()}
                    </span>
                  )}
                  {g.is_tiebreaker && (
                    <span className="font-medium uppercase tracking-wide text-orange">Tiebreaker</span>
                  )}
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <TeamSide
                  label={`${rankLabel(g.away_rank)}${g.away_team}`}
                  spreadLabel={formatSpread(g.spread, "away")}
                  score={g.is_final ? g.away_score : null}
                  picks={awayPicks}
                  game={g}
                  side="away"
                  locked={locked}
                />
                <TeamSide
                  label={`${rankLabel(g.home_rank)}${g.home_team}`}
                  spreadLabel={formatSpread(g.spread, "home")}
                  score={g.is_final ? g.home_score : null}
                  picks={homePicks}
                  game={g}
                  side="home"
                  locked={locked}
                />
              </div>

              {g.is_tiebreaker && locked && picks.some((p) => p.tiebreaker_guess != null) && (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-line/60 pt-2 text-[11px] text-mute">
                  {picks
                    .filter((p) => p.tiebreaker_guess != null)
                    .map((p) => (
                      <span key={p.user_id}>
                        {p.profiles?.display_name}: {p.tiebreaker_guess}
                      </span>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TeamSide({
  label,
  spreadLabel,
  score,
  picks,
  game,
  side,
  locked,
}: {
  label: string;
  spreadLabel: string;
  score: number | null;
  picks: PickRow[];
  game: Game;
  side: "home" | "away";
  locked: boolean;
}) {
  return (
    <div className="min-w-0 rounded border border-line/60 bg-surface2/40 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-display text-sm leading-tight text-ink">{label}</span>
        <span className="shrink-0 whitespace-nowrap text-xs text-mute">{spreadLabel}</span>
      </div>
      {score != null && <div className="mt-0.5 font-display text-lg text-ink">{score}</div>}

      <div className="mt-2 flex min-h-[1.75rem] flex-wrap gap-1">
        {!locked ? (
          <span className="text-[10px] text-mute">Locks at kickoff</span>
        ) : picks.length === 0 ? (
          <span className="text-[10px] text-mute">No picks</span>
        ) : (
          picks.map((p) => {
            const result = atsResult(game, side);
            return (
              <Avatar
                key={p.user_id}
                profile={p.profiles}
                size="sm"
                ring={result === "correct" || result === "incorrect" ? result : null}
                title={p.profiles?.display_name}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
