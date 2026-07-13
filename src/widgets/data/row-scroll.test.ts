import { describe, expect, test } from "vitest";
import { maxRowScrollTop, trackYToScrollTop, wheelScrollTop } from "./row-scroll.ts";

describe("maxRowScrollTop", () => {
  test("is the overflowing rows, clamped at zero when everything fits", () => {
    expect(maxRowScrollTop(30, 10)).toBe(20);
    expect(maxRowScrollTop(5, 10)).toBe(0);
    expect(maxRowScrollTop(10, 10)).toBe(0);
  });
});

describe("wheelScrollTop", () => {
  test("steps up/down by 3 rows within [0, max]", () => {
    expect(wheelScrollTop("scroll_up", 5, 20)).toBe(2);
    expect(wheelScrollTop("scroll_up", 0, 20)).toBe(0); // clamps at the top
    expect(wheelScrollTop("scroll_up", 1, 20)).toBe(0); // clamps rather than going negative
    expect(wheelScrollTop("scroll_down", 5, 20)).toBe(8);
    expect(wheelScrollTop("scroll_down", 20, 20)).toBe(20); // clamps at the bottom
    expect(wheelScrollTop("scroll_down", 19, 20)).toBe(20); // clamps rather than overshooting
  });

  test("returns null for a non-wheel event so the caller leaves it alone", () => {
    expect(wheelScrollTop("press", 5, 20)).toBeNull();
  });
});

describe("trackYToScrollTop", () => {
  test("maps the track top/middle/bottom to 0 / mid / max", () => {
    // Track of 11 rows starting at y=0, max scroll 100.
    expect(trackYToScrollTop(0, 0, 11, 100)).toBe(0);
    expect(trackYToScrollTop(10, 0, 11, 100)).toBe(100);
    expect(trackYToScrollTop(5, 0, 11, 100)).toBe(50);
  });

  test("honors a non-zero track top (header offset)", () => {
    expect(trackYToScrollTop(2, 2, 11, 100)).toBe(0); // at the track's own top
  });

  test("clamps out-of-range y to the ends", () => {
    expect(trackYToScrollTop(-5, 0, 11, 100)).toBe(0);
    expect(trackYToScrollTop(999, 0, 11, 100)).toBe(100);
  });

  test("returns null when the track can't scroll", () => {
    expect(trackYToScrollTop(5, 0, 1, 100)).toBeNull(); // track too short
    expect(trackYToScrollTop(5, 0, 11, 0)).toBeNull(); // nothing to scroll
  });
});
