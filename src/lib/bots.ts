import { atsWinnerSide, type ATSGame, type UserRecord } from "@/lib/scoring";

export type BotGame = ATSGame & { id: number };

export type Bot = {
  id: string;
  name: string;
  emoji: string;
  pick: (game: BotGame) => "home" | "away";
};

// A stable per-game hash so "Random Bot" always shows the same pick for a
// given game instead of reshuffling on every page load.
function seededPick(gameId: number): "home" | "away" {
  let h = gameId * 2654435761;
  h = h ^ (h >>> 15);
  return h % 2 === 0 ? "home" : "away";
}

export const BOTS: Bot[] = [
  { id: "bot-home", name: "Home Bot", emoji: "🏠", pick: () => "home" },
  { id: "bot-away", name: "Away Bot", emoji: "✈️", pick: () => "away" },
  {
    id: "bot-favorites",
    name: "Favorites Bot",
    emoji: "⭐",
    pick: (g) => (g.spread <= 0 ? "home" : "away"),
  },
  {
    id: "bot-underdogs",
    name: "Underdogs Bot",
    emoji: "🐶",
    pick: (g) => (g.spread <= 0 ? "away" : "home"),
  },
  { id: "bot-random", name: "Random Bot", emoji: "🎲", pick: (g) => seededPick(g.id) },
];

export type BotStanding = Bot & { record: UserRecord; points: number };

export function computeBotStandings(games: BotGame[]): BotStanding[] {
  return BOTS.map((bot) => {
    const record: UserRecord = { wins: 0, losses: 0, pushes: 0 };
    for (const g of games) {
      const winner = atsWinnerSide(g);
      if (winner == null) continue;
      if (winner === "push") record.pushes++;
      else if (winner === bot.pick(g)) record.wins++;
      else record.losses++;
    }
    return { ...bot, record, points: record.wins };
  });
}
