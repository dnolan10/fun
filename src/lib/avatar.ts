export const AVATAR_COLORS = [
  "#F2691C",
  "#D9A05B",
  "#C1462E",
  "#4E8B65",
  "#3E6B9C",
  "#8A5FBF",
  "#C74E7D",
  "#5F8FA6",
  "#B7943C",
  "#6B7FD7",
];

export const AVATAR_EMOJI = [
  "🏈", "🔥", "🐐", "🦅", "🐻", "🦁", "🐯", "🐺", "🦊", "🐗",
  "🐢", "🦖", "🍕", "🌮", "🍔", "🥃", "🎯", "🎲", "🃏", "💀",
  "👑", "⚡", "🌪️", "🥶", "🍀", "🎃",
];

export function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function initialForName(name: string): string {
  return (name?.trim()?.[0] ?? "?").toUpperCase();
}
