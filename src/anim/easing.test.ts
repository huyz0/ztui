import { describe, expect, test } from "vitest";
import { EASINGS, type Easing, interpolate, resolveEasing } from "./easing.ts";

const ALL = Object.keys(EASINGS) as Easing[];

describe("easing", () => {
  test("every curve anchors at 0 and 1", () => {
    for (const name of ALL) {
      const fn = EASINGS[name];
      expect(fn(0)).toBeCloseTo(0, 5);
      expect(fn(1)).toBeCloseTo(1, 5);
    }
  });

  test("monotone curves stay within [0,1]; back/elastic overshoot by design", () => {
    for (const name of ALL) {
      const fn = EASINGS[name];
      for (let i = 0; i <= 10; i++) {
        const v = fn(i / 10);
        if (name === "out-back" || name === "out-elastic") {
          expect(Number.isFinite(v)).toBe(true);
        } else {
          expect(v).toBeGreaterThanOrEqual(-1e-9);
          expect(v).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    }
  });

  test("out-cubic eases out (fast then slow)", () => {
    const fn = EASINGS["out-cubic"];
    expect(fn(0.5)).toBeGreaterThan(0.5); // past halfway by the midpoint
  });

  test("in-quad eases in (slow then fast)", () => {
    expect(EASINGS["in-quad"](0.5)).toBeLessThan(0.5);
  });

  test("resolveEasing defaults to out-cubic and tolerates unknown names", () => {
    expect(resolveEasing()).toBe(EASINGS["out-cubic"]);
    expect(resolveEasing("nope" as Easing)).toBe(EASINGS["out-cubic"]);
  });

  test("interpolate clamps t and lands exactly on endpoints", () => {
    expect(interpolate(10, 20, 0, "linear")).toBe(10);
    expect(interpolate(10, 20, 1, "linear")).toBe(20);
    expect(interpolate(10, 20, -5, "linear")).toBe(10); // clamped low
    expect(interpolate(10, 20, 5, "out-cubic")).toBe(20); // clamped high
    expect(interpolate(0, 100, 0.5, "linear")).toBe(50);
  });
});
