import { describe, it, expect } from "vitest";
import { BOTS, computeBotStandings, type BotGame } from "./bots";

function game(overrides: Partial<BotGame> = {}): BotGame {
  return { id: 1, spread: 0, home_score: null, away_score: null, is_final: false, ...overrides };
}

describe("computeBotStandings", () => {
  it("ignores games that aren't final yet", () => {
    const standings = computeBotStandings([game({ is_final: false })]);
    for (const s of standings) {
      expect(s.record).toEqual({ wins: 0, losses: 0, pushes: 0 });
    }
  });

  it("Home Bot always wins when home covers, loses when away covers", () => {
    const homeCovers = game({ id: 1, is_final: true, spread: -3, home_score: 27, away_score: 17 });
    const awayCovers = game({ id: 2, is_final: true, spread: -3, home_score: 18, away_score: 17 });
    const standings = computeBotStandings([homeCovers, awayCovers]);
    const homeBot = standings.find((b) => b.id === "bot-home")!;
    expect(homeBot.record).toEqual({ wins: 1, losses: 1, pushes: 0 });

    const awayBot = standings.find((b) => b.id === "bot-away")!;
    expect(awayBot.record).toEqual({ wins: 1, losses: 1, pushes: 0 });
  });

  it("a push counts as a push for every bot, not a win or loss", () => {
    const push = game({ id: 1, is_final: true, spread: -3, home_score: 20, away_score: 17 });
    const standings = computeBotStandings([push]);
    for (const s of standings) {
      expect(s.record).toEqual({ wins: 0, losses: 0, pushes: 1 });
    }
  });

  it("Favorites Bot picks the spread favorite, Underdogs Bot the opposite", () => {
    // home favored by 3, home covers by 7 -- favorite (home) wins
    const homeFavoredCovers = game({ id: 1, is_final: true, spread: -3, home_score: 27, away_score: 17 });
    const standings = computeBotStandings([homeFavoredCovers]);
    expect(standings.find((b) => b.id === "bot-favorites")!.record.wins).toBe(1);
    expect(standings.find((b) => b.id === "bot-underdogs")!.record.losses).toBe(1);
  });

  it("every bot's record accounts for every final game exactly once", () => {
    const games = [
      game({ id: 1, is_final: true, spread: -3, home_score: 27, away_score: 17 }),
      game({ id: 2, is_final: true, spread: 3, home_score: 10, away_score: 20 }),
      game({ id: 3, is_final: true, spread: 0, home_score: 14, away_score: 14 }),
      game({ id: 4, is_final: false }),
    ];
    const standings = computeBotStandings(games);
    for (const s of standings) {
      expect(s.record.wins + s.record.losses + s.record.pushes).toBe(3);
    }
  });

  it("Random Bot is deterministic for the same game id", () => {
    const g = game({ id: 42, is_final: true, spread: -3, home_score: 27, away_score: 17 });
    const first = computeBotStandings([g]).find((b) => b.id === "bot-random")!;
    const second = computeBotStandings([g]).find((b) => b.id === "bot-random")!;
    expect(first.record).toEqual(second.record);
  });

  it("returns one entry per defined bot", () => {
    const standings = computeBotStandings([]);
    expect(standings.map((s) => s.id)).toEqual(BOTS.map((b) => b.id));
  });
});
