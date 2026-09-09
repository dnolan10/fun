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
