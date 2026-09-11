export default function WeeklyWinnerBanner({
  weekLabel,
  points,
  champions,
}: {
  weekLabel: string;
  points: number;
  champions: string[];
}) {
  if (champions.length === 0) return null;
  return (
    <div className="rounded border border-tan/50 bg-tan/10 p-4 text-center">
      <p className="text-xs uppercase tracking-wide text-tan">
        🏆 {weekLabel} champion{champions.length > 1 ? "s" : ""}
      </p>
      <p className="mt-1 font-display text-xl text-ink">{champions.join(" & ")}</p>
      <p className="text-sm text-mute">{points} pts</p>
    </div>
  );
}
