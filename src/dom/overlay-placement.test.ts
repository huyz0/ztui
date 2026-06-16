import { describe, expect, test } from "vitest";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { placeByBestSide } from "./overlay.ts";

const rect = (x: number, y: number, w: number, h: number) =>
  new Region(new Offset(x, y), new Size(w, h));
const SCREEN = rect(0, 0, 80, 24);

describe("placeByBestSide", () => {
  test("auto: opens below the anchor when there is room", () => {
    // item at (10,5) 6x2; menu 10x4 → sits flush below, left-aligned.
    expect(placeByBestSide(rect(10, 5, 6, 2), 10, 4, SCREEN)).toEqual({ x: 10, y: 7 });
  });

  test("auto: flips above when there is no room below", () => {
    // item near the bottom (bottom edge at 23); only 1 row below, 21 above.
    expect(placeByBestSide(rect(10, 21, 6, 2), 10, 4, SCREEN)).toEqual({ x: 10, y: 17 });
  });

  test("auto: falls to a horizontal side when neither vertical side fits", () => {
    // Short screen: no vertical room, but room to the right of the item.
    const screen = rect(0, 0, 40, 6);
    // item 6x4 at (2,1) → bottom edge 5 (1 below), top 1; right space = 40-8 = 32.
    const p = placeByBestSide(rect(2, 1, 6, 4), 12, 5, screen, "auto");
    expect(p).toEqual({ x: 8, y: 1 }); // to the right of the item
  });

  test("explicit right / left place beside the item", () => {
    expect(placeByBestSide(rect(10, 5, 6, 2), 10, 4, SCREEN, "right")).toEqual({ x: 16, y: 5 });
    expect(placeByBestSide(rect(40, 5, 6, 2), 10, 4, SCREEN, "left")).toEqual({ x: 30, y: 5 });
  });

  test("clamps cross-axis so a menu near the right edge stays on-screen", () => {
    // 0-size cursor near the right edge, opening below: x clamps left to fit.
    expect(placeByBestSide(rect(78, 2, 0, 0), 9, 4, SCREEN)).toEqual({ x: 71, y: 2 });
  });

  test("best-fit + clamp keeps an oversized menu fully on-screen", () => {
    const screen = rect(0, 0, 10, 4);
    const p = placeByBestSide(rect(2, 0, 0, 0), 20, 8, screen); // bigger than the screen
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(0); // clamped to the only on-screen origin
    expect(p.y).toBeLessThanOrEqual(0);
  });
});
