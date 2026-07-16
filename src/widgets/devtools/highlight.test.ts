import { describe, expect, test } from "vitest";
import { ScreenBuffer } from "../../render/buffer.ts";
import { DevToolsHighlightWidget } from "./highlight.ts";

describe("DevToolsHighlightWidget", () => {
  test("paints nothing when target is null, or its width/height is less than 1", () => {
    const buffer = new ScreenBuffer(5, 5);
    const w = new DevToolsHighlightWidget();

    w.target = null;
    expect(() => w.render(buffer)).not.toThrow();
    expect(buffer.cells[0][0].char).toBe(" ");

    w.target = { x: 0, y: 0, width: 0, height: 2 };
    expect(() => w.render(buffer)).not.toThrow();

    w.target = { x: 0, y: 0, width: 2, height: 0 };
    expect(() => w.render(buffer)).not.toThrow();
  });

  test("tints the target rect, keeping each cell's existing glyph", () => {
    const buffer = new ScreenBuffer(6, 4);
    // Seed some glyphs so the highlight must preserve them, not overwrite.
    buffer.cells[1][1].char = "X";
    buffer.cells[1][2].char = "Y";

    const w = new DevToolsHighlightWidget();
    w.target = { x: 1, y: 1, width: 2, height: 1 };
    w.render(buffer);

    expect(buffer.cells[1][1].char).toBe("X");
    expect(buffer.cells[1][2].char).toBe("Y");
    // Both cells got tinted with the same background/foreground pair.
    expect(buffer.cells[1][1].style.background).toBe(buffer.cells[1][2].style.background);
    expect(buffer.cells[1][1].style.background).toBeTruthy();
  });

  test("falls back to the literal magenta/black colours without a CSS resolver", () => {
    const buffer = new ScreenBuffer(4, 4);
    const w = new DevToolsHighlightWidget();
    w.target = { x: 0, y: 0, width: 2, height: 1 };
    w.render(buffer);
    expect(buffer.cells[0][0].style.background).toBe("magenta");
    expect(buffer.cells[0][0].style.color).toBe("black");
  });

  test("skips rows/columns that fall outside the buffer instead of throwing", () => {
    const buffer = new ScreenBuffer(3, 3);
    const w = new DevToolsHighlightWidget();
    // Target extends well past the buffer on every edge, including negative
    // coordinates, so both the row (y) and column (x) bounds guards must fire.
    w.target = { x: -2, y: -2, width: 10, height: 10 };
    expect(() => w.render(buffer)).not.toThrow();
    // The in-bounds overlap (0..2, 0..2) still gets tinted.
    expect(buffer.cells[0][0].style.background).toBe("magenta");
    expect(buffer.cells[2][2].style.background).toBe("magenta");
  });

  test("blanks a cell whose glyph is falsy (empty string)", () => {
    const buffer = new ScreenBuffer(3, 3);
    buffer.cells[0][0].char = "";
    const w = new DevToolsHighlightWidget();
    w.target = { x: 0, y: 0, width: 1, height: 1 };
    w.render(buffer);
    // `row[x]?.char || " "` falls back to a space for the falsy empty string.
    expect(buffer.cells[0][0].char).toBe(" ");
  });
});
