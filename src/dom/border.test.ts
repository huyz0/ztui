import { describe, expect, test } from "vitest";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { ScreenBuffer } from "../render/buffer.ts";
import { Widget } from "./widget.ts";

function charAt(buffer: ScreenBuffer, x: number, y: number): string {
  return buffer.cells[y][x].char;
}

// Build a 5x4 widget, render it, and return its four corner glyphs.
function corners(border: string): {
  tl: string;
  tr: string;
  bl: string;
  br: string;
  top: string;
  left: string;
} {
  const w = new Widget("box");
  w.style.width = 5;
  w.style.height = 4;
  w.style.border = border;
  w.region = new Region(Offset.ORIGIN, new Size(5, 4));

  const buffer = new ScreenBuffer(5, 4);
  w.render(buffer);

  return {
    tl: charAt(buffer, 0, 0),
    tr: charAt(buffer, 4, 0),
    bl: charAt(buffer, 0, 3),
    br: charAt(buffer, 4, 3),
    top: charAt(buffer, 1, 0),
    left: charAt(buffer, 0, 1),
  };
}

describe("widget border styles", () => {
  test("solid border uses square corners", () => {
    const c = corners("solid");
    expect(c.tl).toBe("┌");
    expect(c.tr).toBe("┐");
    expect(c.bl).toBe("└");
    expect(c.br).toBe("┘");
  });

  test("rounded border uses rounded corners with solid edges", () => {
    const c = corners("rounded");
    expect(c.tl).toBe("╭");
    expect(c.tr).toBe("╮");
    expect(c.bl).toBe("╰");
    expect(c.br).toBe("╯");
    // Edges remain the same straight glyphs as a solid border.
    expect(c.top).toBe("─");
    expect(c.left).toBe("│");
  });

  test('"round" is an alias for "rounded"', () => {
    expect(corners("round")).toEqual(corners("rounded"));
  });

  test("unrecognized border type defaults to rounded corners", () => {
    expect(corners("fancy")).toEqual(corners("rounded"));
  });

  test("heavy border uses heavy corners and edges", () => {
    const c = corners("heavy");
    expect(c.tl).toBe("┏");
    expect(c.tr).toBe("┓");
    expect(c.bl).toBe("┗");
    expect(c.br).toBe("┛");
    expect(c.top).toBe("━");
    expect(c.left).toBe("┃");
  });
});

/** Render a 5×4 widget with arbitrary border styles. */
function build(styles: Record<string, unknown>) {
  const w = new Widget("box");
  Object.assign(w.style, { width: 5, height: 4 }, styles);
  w.region = new Region(Offset.ORIGIN, new Size(5, 4));
  const buffer = new ScreenBuffer(5, 4);
  w.render(buffer);
  return { w, buffer };
}

describe("per-side & heavy borders", () => {
  test("a single side draws a corner-less bar across the whole edge", () => {
    const { buffer } = build({ borderLeft: "heavy" });
    // The left column is a full-height heavy bar — no corner glyphs.
    expect(charAt(buffer, 0, 0)).toBe("┃");
    expect(charAt(buffer, 0, 1)).toBe("┃");
    expect(charAt(buffer, 0, 3)).toBe("┃");
    // No other edges.
    expect(charAt(buffer, 1, 0)).not.toBe("─");
    expect(charAt(buffer, 4, 1)).not.toBe("┃");
  });

  test("a single side only insets layout on that side", () => {
    const { w } = build({ borderLeft: "thin" });
    const cr = w.getContentRect();
    const client = w.getClientRect();
    expect(cr.x).toBe(client.x + 1); // left is inset by the bar
    expect(cr.y).toBe(client.y); // top is not
    expect(cr.width).toBe(client.width - 1);
    expect(cr.height).toBe(client.height);
  });

  test("bar border uses solid block edges", () => {
    const { buffer } = build({ border: "bar" });
    expect(charAt(buffer, 1, 0)).toBe("▀"); // top
    expect(charAt(buffer, 1, 3)).toBe("▄"); // bottom
    expect(charAt(buffer, 0, 1)).toBe("▌"); // left
    expect(charAt(buffer, 4, 1)).toBe("▐"); // right
  });

  test("block border fills the whole cell on every edge", () => {
    const { buffer } = build({ border: "block" });
    expect(charAt(buffer, 1, 0)).toBe("█"); // top
    expect(charAt(buffer, 1, 3)).toBe("█"); // bottom
    expect(charAt(buffer, 0, 1)).toBe("█"); // left
    expect(charAt(buffer, 4, 1)).toBe("█"); // right
    expect(charAt(buffer, 0, 0)).toBe("█"); // corner
  });

  test("a single block side is a full-cell bar across the whole edge", () => {
    const { buffer } = build({ borderLeft: "block" });
    expect(charAt(buffer, 0, 0)).toBe("█");
    expect(charAt(buffer, 0, 1)).toBe("█");
    expect(charAt(buffer, 0, 3)).toBe("█");
    expect(charAt(buffer, 1, 0)).not.toBe("█"); // no top edge
  });

  test("a per-side weight overrides the all-sides border for its side", () => {
    const { buffer } = build({ border: "thin", borderTop: "heavy" });
    expect(charAt(buffer, 1, 0)).toBe("━"); // heavy top edge
    expect(charAt(buffer, 1, 3)).toBe("─"); // thin bottom edge
    expect(charAt(buffer, 0, 0)).toBe("┏"); // corner takes the top side's weight
  });

  test('a per-side "none" drops that side of an all-sides border', () => {
    const { w, buffer } = build({ border: "solid", borderTop: "none" });
    expect(charAt(buffer, 1, 0)).not.toBe("─"); // no top edge
    expect(charAt(buffer, 0, 1)).toBe("│"); // left edge still there
    expect(w.borderSize.top).toBe(0);
    expect(w.borderSize.left).toBe(1);
  });
});
