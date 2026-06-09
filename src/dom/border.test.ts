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
});
