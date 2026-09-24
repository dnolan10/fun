import { describe, it, expect } from "vitest";
import {
  atsMargin,
  atsResult,
  atsWinnerSide,
  currentStreak,
  favoriteLabel,
  formatRecord,
  formatSpread,
  isCloseCall,
  isLocked,
  rankLabel,
  sortByRankThenSpread,
  statLine,
  type ATSGame,
} from "./scoring";

function game(overrides: Partial<ATSGame> = {}): ATSGame {
  return { spread: 0, home_score: null, away_score: null, is_final: false, ...overrides };
}

describe("formatSpread", () => {
  it("shows PICK for a pick'em game", () => {
    expect(formatSpread(0, "home")).toBe("PICK");
    expect(formatSpread(0, "away")).toBe("PICK");
  });
  it("shows the home team's spread as-is", () => {
    expect(formatSpread(-6.5, "home")).toBe("-6.5");
    expect(formatSpread(3, "home")).toBe("+3");
  });
  it("negates for the away team", () => {
    expect(formatSpread(-6.5, "away")).toBe("+6.5");
    expect(formatSpread(3, "away")).toBe("-3");
  });
});

describe("favoriteLabel", () => {
  it("says Even for a pick'em", () => {
    expect(favoriteLabel(0, "Home U", "Away U")).toBe("Even");
  });
  it("favors home on a negative spread", () => {
    expect(favoriteLabel(-6.5, "Home U", "Away U")).toBe("Home U favored by 6.5");
  });
  it("favors away on a positive spread", () => {
    expect(favoriteLabel(6.5, "Home U", "Away U")).toBe("Away U favored by 6.5");
  });
});

describe("isLocked", () => {
  it("is locked once kickoff has passed", () => {
    expect(isLocked(new Date(Date.now() - 60_000).toISOString())).toBe(true);
  });
  it("is not locked before kickoff", () => {
    expect(isLocked(new Date(Date.now() + 60_000).toISOString())).toBe(false);
  });
});

describe("rankLabel", () => {
  it("formats a rank", () => {
    expect(rankLabel(5)).toBe("#5 ");
  });
  it("is blank for no rank", () => {
    expect(rankLabel(null)).toBe("");
    expect(rankLabel(undefined)).toBe("");
    expect(rankLabel(0)).toBe("");
  });
});

describe("statLine", () => {
  it("joins record and ppg", () => {
    expect(statLine("5-2", 31.4)).toBe("5-2 · 31.4 pts/gm (pool)");
  });
  it("handles missing pieces", () => {
    expect(statLine(null, 31.4)).toBe("31.4 pts/gm (pool)");
    expect(statLine("5-2", null)).toBe("5-2");
    expect(statLine(null, null)).toBe("");
  });
});

describe("sortByRankThenSpread", () => {
  it("puts ranked teams first, best rank first", () => {
    const games = [
      { spread: 1, home_rank: null, away_rank: null },
      { spread: 1, home_rank: 10, away_rank: null },
      { spread: 1, home_rank: null, away_rank: 3 },
    ];
    const sorted = sortByRankThenSpread(games);
    expect(sorted.map((g) => g.away_rank ?? g.home_rank)).toEqual([3, 10, null]);
  });
  it("among unranked games, sorts by biggest spread first", () => {
    const games = [
      { spread: -3, home_rank: null, away_rank: null },
      { spread: 21, home_rank: null, away_rank: null },
      { spread: -10, home_rank: null, away_rank: null },
    ];
    const sorted = sortByRankThenSpread(games);
    expect(sorted.map((g) => g.spread)).toEqual([21, -10, -3]);
  });
});

describe("atsMargin / atsWinnerSide / isCloseCall", () => {
  it("is null before the game is final", () => {
    const g = game({ spread: -3, home_score: 20, away_score: 17 });
    expect(atsMargin(g)).toBeNull();
    expect(atsWinnerSide(g)).toBeNull();
    expect(isCloseCall(g)).toBe(false);
  });

  it("computes the home-relative margin once final", () => {
    // home wins by 3, home favored by 3 -> exact push
    const push = game({ is_final: true, spread: -3, home_score: 20, away_score: 17 });
    expect(atsMargin(push)).toBe(0);
    expect(atsWinnerSide(push)).toBe("push");
    expect(isCloseCall(push)).toBe(true);

    // home wins by 10, favored by 3 -> covers by 7
    const homeCovers = game({ is_final: true, spread: -3, home_score: 27, away_score: 17 });
    expect(atsMargin(homeCovers)).toBe(7);
    expect(atsWinnerSide(homeCovers)).toBe("home");
    expect(isCloseCall(homeCovers)).toBe(false);

    // home wins by 1, favored by 3 -> away covers by 2
    const awayCovers = game({ is_final: true, spread: -3, home_score: 18, away_score: 17 });
    expect(atsMargin(awayCovers)).toBe(-2);
    expect(atsWinnerSide(awayCovers)).toBe("away");
    expect(isCloseCall(awayCovers)).toBe(true);
  });

  it("respects a custom close-call threshold", () => {
    const g = game({ is_final: true, spread: 0, home_score: 24, away_score: 20 });
    expect(isCloseCall(g, 3)).toBe(false);
    expect(isCloseCall(g, 4)).toBe(true);
  });
});

describe("atsResult", () => {
  const finalGame = game({ is_final: true, spread: -3, home_score: 27, away_score: 17 }); // home covers by 7

  it("is null until final or without a pick", () => {
    expect(atsResult(game({ spread: -3 }), "home")).toBeNull();
    expect(atsResult(finalGame, undefined)).toBeNull();
    expect(atsResult(finalGame, null)).toBeNull();
  });

  it("is correct/incorrect based on the pick", () => {
    expect(atsResult(finalGame, "home")).toBe("correct");
    expect(atsResult(finalGame, "away")).toBe("incorrect");
  });

  it("is a push for either pick on an exact push", () => {
    const push = game({ is_final: true, spread: -3, home_score: 20, away_score: 17 });
    expect(atsResult(push, "home")).toBe("push");
    expect(atsResult(push, "away")).toBe("push");
  });
});

describe("currentStreak", () => {
  it("counts a positive streak", () => {
    expect(currentStreak(["correct", "correct", "correct"])).toBe(3);
  });
  it("counts a negative streak", () => {
    expect(currentStreak(["incorrect", "incorrect"])).toBe(-2);
  });
  it("stops at the first opposite result", () => {
    expect(currentStreak(["correct", "correct", "incorrect", "correct"])).toBe(2);
  });
  it("skips pushes without breaking or counting toward the streak", () => {
    expect(currentStreak(["correct", "push", "correct"])).toBe(2);
  });
  it("is 0 with no decided results", () => {
    expect(currentStreak([])).toBe(0);
    expect(currentStreak(["push", "push"])).toBe(0);
  });
});

describe("formatRecord", () => {
  it("omits pushes when there are none", () => {
    expect(formatRecord({ wins: 3, losses: 1, pushes: 0 })).toBe("3-1");
  });
  it("includes pushes when present", () => {
    expect(formatRecord({ wins: 3, losses: 1, pushes: 2 })).toBe("3-1-2");
  });
});
