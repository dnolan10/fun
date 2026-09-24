import { describe, it, expect } from "vitest";
import { AVATAR_COLORS, colorForName, initialForName } from "./avatar";

describe("colorForName", () => {
  it("is deterministic for the same name", () => {
    expect(colorForName("Doug")).toBe(colorForName("Doug"));
  });
  it("always returns one of the defined palette colors", () => {
    for (const name of ["Doug", "Kyle", "", "a very long display name indeed"]) {
      expect(AVATAR_COLORS).toContain(colorForName(name));
    }
  });
});

describe("initialForName", () => {
  it("uppercases the first letter", () => {
    expect(initialForName("doug")).toBe("D");
  });
  it("trims leading whitespace first", () => {
    expect(initialForName("  doug")).toBe("D");
  });
  it("falls back to ? for empty input", () => {
    expect(initialForName("")).toBe("?");
    expect(initialForName("   ")).toBe("?");
  });
});
