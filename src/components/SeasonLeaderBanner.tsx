export default function SeasonLeaderBanner({
  points,
  leaders,
}: {
  points: number;
  leaders: string[];
}) {
  if (leaders.length === 0) return null;
  return (
    <div className="rounded border border-orange/50 bg-orange/10 p-4 text-center">
      <p className="text-xs uppercase tracking-wide text-orange">
        👑 Season leader{leaders.length > 1 ? "s" : ""}
      </p>
      <p className="mt-1 font-display text-xl text-ink">{leaders.join(" & ")}</p>
      <p className="text-sm text-mute">{points} pts</p>
    </div>
  );
}
