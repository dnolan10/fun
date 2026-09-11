export type ATSGame = {
  spread: number;
  home_score: number | null;
  away_score: number | null;
  is_final: boolean;
};

// Result of a single pick against the spread, null until the game is final.
export function atsResult(
  g: ATSGame,
  pick: "home" | "away" | null | undefined
): "correct" | "incorrect" | "push" | null {
  if (!g.is_final || g.home_score == null || g.away_score == null || !pick) return null;
  const margin = g.home_score - g.away_score + g.spread;
  const winner = margin > 0 ? "home" : margin < 0 ? "away" : "push";
  if (winner === "push") return "push";
  return winner === pick ? "correct" : "incorrect";
}

// Given a user's past picks ordered most-recent-first, how many in a row
// they've gotten right (positive) or wrong (negative). Pushes don't count
// either way and don't break the streak.
export function currentStreak(resultsMostRecentFirst: Array<"correct" | "incorrect" | "push">): number {
  let streak = 0;
  let direction: "correct" | "incorrect" | null = null;
  for (const result of resultsMostRecentFirst) {
    if (result === "push") continue;
    if (direction === null) {
      direction = result;
      streak = 1;
    } else if (result === direction) {
      streak++;
    } else {
      break;
    }
  }
  return direction === "incorrect" ? -streak : streak;
}

// Signed margin against the spread, from the home team's perspective. Null
// until the game is final. 0 = an exact push.
export function atsMargin(g: ATSGame): number | null {
  if (!g.is_final || g.home_score == null || g.away_score == null) return null;
  return g.home_score - g.away_score + g.spread;
}

// A game that came down to the wire against the spread -- a push or a
// margin within `threshold` points either way.
export function isCloseCall(g: ATSGame, threshold = 3): boolean {
  const margin = atsMargin(g);
  return margin != null && Math.abs(margin) <= threshold;
}

// Which side covered the spread. Null until the game is final.
export function atsWinnerSide(g: ATSGame): "home" | "away" | "push" | null {
  const margin = atsMargin(g);
  if (margin == null) return null;
  if (margin > 0) return "home";
  if (margin < 0) return "away";
  return "push";
}

export type UserRecord = { wins: number; losses: number; pushes: number };

export function formatRecord(rec: UserRecord): string {
  return rec.pushes > 0 ? `${rec.wins}-${rec.losses}-${rec.pushes}` : `${rec.wins}-${rec.losses}`;
}

export function formatSpread(spread: number, side: "home" | "away") {
  // spread is stored relative to the home team.
  const effective = side === "home" ? spread : -spread;
  if (effective === 0) return "PICK";
  return effective > 0 ? `+${effective}` : `${effective}`;
}

export function favoriteLabel(spread: number, home: string, away: string) {
  if (spread === 0) return "Even";
  return spread < 0 ? `${home} favored by ${Math.abs(spread)}` : `${away} favored by ${Math.abs(spread)}`;
}

export function isLocked(kickoffTimeIso: string) {
  return new Date(kickoffTimeIso).getTime() <= Date.now();
}

export function rankLabel(rank: number | null | undefined) {
  return rank ? `#${rank} ` : "";
}

export function statLine(record: string | null | undefined, ppg: number | null | undefined) {
  const parts = [];
  if (record) parts.push(record);
  if (ppg != null) parts.push(`${ppg} pts/gm (pool)`);
  return parts.join(" · ");
}

// Ranked games first (lowest AP rank first). Among games with no ranked
// team, sort by the largest spread (most lopsided) first.
export function sortByRankThenSpread<
  T extends { spread: number; home_rank?: number | null; away_rank?: number | null }
>(games: T[]): T[] {
  const bestRank = (g: T) => Math.min(g.home_rank ?? 999, g.away_rank ?? 999);
  return [...games].sort((a, b) => {
    const ra = bestRank(a);
    const rb = bestRank(b);
    if (ra !== rb) return ra - rb;
    return Math.abs(b.spread) - Math.abs(a.spread);
  });
}
