import { describe, expect, test } from "vitest";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { ScreenBuffer } from "./buffer.ts";
import { parseColor } from "./color.ts";
import { Style } from "./style.ts";

const BASE = { bg: { r: 0, g: 0, b: 0 }, fg: { r: 255, g: 255, b: 255 } };
const BLACK = { r: 0, g: 0, b: 0 };
const rect = (x: number, y: number, w: number, h: number) =>
  new Region(new Offset(x, y), new Size(w, h));

describe("ScreenBuffer.blendRegion", () => {
  test("blends a concrete cell background toward the source colour", () => {
    const buf = new ScreenBuffer(2, 1);
    buf.setCell(0, 0, "x", new Style({ background: "#646464", color: "#c8c8c8" })); // 100 / 200
    buf.blendRegion(rect(0, 0, 1, 1), BLACK, 0.5, BASE);
    const cell = buf.cells[0][0];
    expect(cell.char).toBe("x"); // glyph untouched
    expect(parseColor(cell.style.background!)?.rgb).toEqual({ r: 50, g: 50, b: 50 });
    expect(parseColor(cell.style.color!)?.rgb).toEqual({ r: 100, g: 100, b: 100 });
  });

  test("uses the blend base for cells with default/unset colours", () => {
    const buf = new ScreenBuffer(1, 1);
    // default bg/fg → blend against BASE (bg black, fg white)
    buf.setCell(0, 0, " ", Style.DEFAULT);
    buf.blendRegion(rect(0, 0, 1, 1), { r: 200, g: 0, b: 0 }, 0.5, BASE);
    const cell = buf.cells[0][0];
    expect(parseColor(cell.style.background!)?.rgb).toEqual({ r: 100, g: 0, b: 0 }); // black→red @50%
    expect(parseColor(cell.style.color!)?.rgb).toEqual({ r: 228, g: 128, b: 128 }); // white→red @50%
  });

  test("alpha 0 is a no-op; alpha 1 replaces with the source", () => {
    const buf = new ScreenBuffer(2, 1);
    buf.setCell(0, 0, "a", new Style({ background: "#102030" }));
    buf.setCell(1, 0, "b", new Style({ background: "#102030" }));
    buf.blendRegion(rect(0, 0, 1, 1), BLACK, 0, BASE);
    buf.blendRegion(rect(1, 0, 1, 1), BLACK, 1, BASE);
    expect(parseColor(buf.cells[0][0].style.background!)?.rgb).toEqual({ r: 16, g: 32, b: 48 });
    expect(parseColor(buf.cells[0][1].style.background!)?.rgb).toEqual({ r: 0, g: 0, b: 0 });
  });

  test("clips to buffer bounds without throwing", () => {
    const buf = new ScreenBuffer(2, 2);
    expect(() => buf.blendRegion(rect(-5, -5, 20, 20), BLACK, 0.5, BASE)).not.toThrow();
  });
});
