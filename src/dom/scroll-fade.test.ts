import { describe, expect, test } from "vitest";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { ScreenBuffer } from "../render/buffer.ts";
import { Style } from "../render/style.ts";
import { fadeClippedRight, fadeScrollEdges } from "./scroll-fade.ts";

// Fill a region with solid-white cells so a fade is detectable as a colour shift.
function fillWhite(buf: ScreenBuffer, r: Region) {
  for (let y = r.y; y < r.bottom; y++)
    for (let x = r.x; x < r.right; x++) buf.setCell(x, y, "X", new Style({ color: "#ffffff" }));
}
const white = (buf: ScreenBuffer, y: number) => buf.cells[y][0].style.color === "#ffffff";
const whiteCol = (buf: ScreenBuffer, x: number) => buf.cells[0][x].style.color === "#ffffff";
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

describe("fadeClippedRight", () => {
  const rowRegion = new Region(new Offset(0, 0), new Size(6, 1));

  test("fades only the rightmost two columns", () => {
    const buf = new ScreenBuffer(6, 1);
    fillWhite(buf, rowRegion);
    fadeClippedRight(buf, rowRegion);
    expect(whiteCol(buf, 0)).toBe(true); // left crisp
    expect(whiteCol(buf, 3)).toBe(true); // middle crisp
    expect(whiteCol(buf, 4)).toBe(false); // penultimate faded
    expect(whiteCol(buf, 5)).toBe(false); // last column faded hardest
  });

  test("rightmost column fades more than penultimate", () => {
    const buf = new ScreenBuffer(6, 1);
    fillWhite(buf, rowRegion);
    fadeClippedRight(buf, rowRegion);
    const col4 = buf.cells[0][4].style.color!;
    const col5 = buf.cells[0][5].style.color!;
    // Both are faded (not pure white).
    expect(col4).not.toBe("#ffffff");
    expect(col5).not.toBe("#ffffff");
    // col5 uses a higher alpha (FADE_EDGE=0.55 vs FADE_NEXT=0.25) so it blends
    // more toward black — parse the first numeric channel to compare brightness.
    // Colors come back as "rgb(r, g, b)" from blendRegion.
    const firstChannel = (c: string) => {
      const m = c.match(/\d+/);
      return m ? parseInt(m[0]) : 0;
    };
    expect(firstChannel(col5)).toBeLessThan(firstChannel(col4));
  });

  test("is a no-op for a single-column region", () => {
    const buf = new ScreenBuffer(1, 1);
    buf.setCell(0, 0, "X", new Style({ color: "#ffffff" }));
    expect(() => fadeClippedRight(buf, new Region(new Offset(0, 0), new Size(1, 1)))).not.toThrow();
    expect(buf.cells[0][0].style.color).toBe("#ffffff"); // untouched
  });

  test("applies to multi-row regions (all rows fade at the right edge)", () => {
    const multiRow = new Region(new Offset(0, 0), new Size(4, 3));
    const buf = new ScreenBuffer(4, 3);
    fillWhite(buf, multiRow);
    fadeClippedRight(buf, multiRow);
    for (let y = 0; y < 3; y++) {
      expect(buf.cells[y][3].style.color).not.toBe("#ffffff"); // right col faded
      expect(buf.cells[y][0].style.color).toBe("#ffffff"); // left col crisp
    }
  });
});
