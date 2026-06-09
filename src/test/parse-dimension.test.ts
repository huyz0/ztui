import { describe, expect, test } from "vitest";
import { parseDimension } from "../layout/layout.ts";

describe("parseDimension robustness", () => {
  test("valid inputs resolve as expected", () => {
    expect(parseDimension(undefined, 100)).toBe(1);
    expect(parseDimension("auto", 100, 7)).toBe(7);
    expect(parseDimension(42, 100)).toBe(42);
    expect(parseDimension("50%", 200)).toBe(100);
    expect(parseDimension("3fr", 100)).toEqual({ fr: 3 });
    expect(parseDimension("10", 100)).toBe(10);
  });

  test("malformed strings fall back to the default instead of NaN", () => {
    expect(parseDimension("abc", 100, -1)).toBe(-1);
    expect(parseDimension("%", 100, 5)).toBe(5);
    expect(parseDimension("abc%", 100, 5)).toBe(5);
    expect(parseDimension("w", 100, 5)).toBe(5);
  });

  test("malformed fr never poisons distribution with NaN", () => {
    expect(parseDimension("fr", 100)).toEqual({ fr: 0 });
    expect(parseDimension("-2fr", 100)).toEqual({ fr: 0 });
  });

  test("negative sizes are clamped to zero", () => {
    expect(parseDimension("-50%", 200)).toBe(0);
    expect(parseDimension("-10", 100)).toBe(0);
  });

  test("no result is ever NaN", () => {
    for (const bad of ["%", "fr", "abc", "w", "h", "-5", "-1%", "NaNfr"]) {
      const r = parseDimension(bad, 100);
      const n = typeof r === "object" ? r.fr : r;
      expect(Number.isNaN(n)).toBe(false);
    }
  });
});
