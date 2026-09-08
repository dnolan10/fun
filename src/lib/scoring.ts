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
