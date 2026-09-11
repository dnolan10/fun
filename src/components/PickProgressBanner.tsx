import { isLocked } from "@/lib/scoring";
import type { PickCompletion } from "@/lib/pickProgress";

type Game = {
  home_team: string;
  away_team: string;
  kickoff_time: string;
};

function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "any moment";
  const totalMinutes = Math.round(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function PickProgressBanner({
  games,
  completion,
  currentUserId,
}: {
  games: Game[];
  completion: PickCompletion[];
  currentUserId: string;
}) {
  const unlockedGames = games.filter((g) => !isLocked(g.kickoff_time));
  if (unlockedGames.length === 0 || completion.length === 0) return null;

  const nextLock = unlockedGames.reduce((soonest, g) =>
    new Date(g.kickoff_time) < new Date(soonest.kickoff_time) ? g : soonest
  );

  const completeCount = completion.filter((c) => c.is_complete).length;
  const stragglers = completion.filter((c) => !c.is_complete);

  return (
    <div className="rounded border border-orange/40 bg-orange/5 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-ink">
          ⏰ Next lock:{" "}
          <strong className="font-medium">
            {nextLock.away_team} @ {nextLock.home_team}
          </strong>{" "}
          in {timeUntil(nextLock.kickoff_time)}
        </span>
        <span className="text-xs text-mute">
          {completeCount}/{completion.length} have submitted a full slate
        </span>
      </div>
      {stragglers.length > 0 ? (
        <p className="mt-1 text-xs text-mute">
          Still need picks:{" "}
          {stragglers
            .map((s) => (s.user_id === currentUserId ? `${s.display_name} (you)` : s.display_name))
            .join(", ")}
        </p>
      ) : (
        <p className="mt-1 text-xs text-tan">Everybody&apos;s in. 🎉</p>
      )}
    </div>
  );
}
