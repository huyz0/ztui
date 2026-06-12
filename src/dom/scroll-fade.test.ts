import { describe, expect, test } from "vitest";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { ScreenBuffer } from "../render/buffer.ts";
import { Style } from "../render/style.ts";
import { fadeScrollEdges } from "./scroll-fade.ts";

// Fill a region with solid-white cells so a fade is detectable as a colour shift.
function fillWhite(buf: ScreenBuffer, r: Region) {
  for (let y = r.y; y < r.bottom; y++)
    for (let x = r.x; x < r.right; x++) buf.setCell(x, y, "X", new Style({ color: "#ffffff" }));
}
const white = (buf: ScreenBuffer, y: number) => buf.cells[y][0].style.color === "#ffffff";
const region = new Region(new Offset(0, 0), new Size(4, 6));

describe("fadeScrollEdges", () => {
  test("fades only the bottom edge when content is hidden below", () => {
    const buf = new ScreenBuffer(4, 6);
    fillWhite(buf, region);
    fadeScrollEdges(buf, region, false, true);
    expect(white(buf, 0)).toBe(true); // top crisp
    expect(white(buf, 3)).toBe(true); // middle crisp
    expect(white(buf, 5)).toBe(false); // bottom faded
  });

  test("fades only the top edge when content is hidden above", () => {
    const buf = new ScreenBuffer(4, 6);
    fillWhite(buf, region);
    fadeScrollEdges(buf, region, true, false);
    expect(white(buf, 0)).toBe(false); // top faded
    expect(white(buf, 3)).toBe(true); // middle crisp
    expect(white(buf, 5)).toBe(true); // bottom crisp
  });

  test("fades both edges, leaving the interior untouched", () => {
    const buf = new ScreenBuffer(4, 6);
    fillWhite(buf, region);
    fadeScrollEdges(buf, region, true, true);
    expect(white(buf, 0)).toBe(false);
    expect(white(buf, 2)).toBe(true); // interior crisp
    expect(white(buf, 5)).toBe(false);
  });

  test("is a no-op when nothing is hidden", () => {
    const buf = new ScreenBuffer(4, 6);
    fillWhite(buf, region);
    fadeScrollEdges(buf, region, false, false);
    for (let y = 0; y < 6; y++) expect(white(buf, y)).toBe(true);
  });

  test("ignores a degenerate one-row region", () => {
    const buf = new ScreenBuffer(4, 1);
    fillWhite(buf, new Region(new Offset(0, 0), new Size(4, 1)));
    expect(() =>
      fadeScrollEdges(buf, new Region(new Offset(0, 0), new Size(4, 1)), true, true),
    ).not.toThrow();
    expect(white(buf, 0)).toBe(true); // untouched
  });
});
