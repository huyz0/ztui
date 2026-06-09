import { describe, expect, test } from "vitest";
import { ScreenBuffer } from "./buffer.ts";
import { Segment } from "./segment.ts";
import { Style } from "./style.ts";

function cellChars(buf: ScreenBuffer, y: number): string {
  return buf.cells[y].map((c) => c.char).join("");
}

describe("buffer never stores raw control characters", () => {
  test("setCell replaces C0/C1 control chars with a space", () => {
    const buf = new ScreenBuffer(5, 1);
    for (const bad of ["\n", "\t", "\r", "\x1b", "\x07", "\x9b"]) {
      buf.setCell(0, 0, bad, Style.DEFAULT);
      expect(buf.cells[0][0].char).toBe(" ");
      expect(buf.cells[0][0].char).not.toBe(bad);
    }
  });

  test("drawSegment with embedded control chars produces no raw control output", () => {
    const buf = new ScreenBuffer(20, 1);
    buf.drawSegment(0, 0, new Segment("ab\ncd\te\x1bf", Style.DEFAULT));
    const row = cellChars(buf, 0);
    // No raw control characters anywhere in the row.
    expect(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(row)).toBe(false);
    // Printable characters are still present.
    expect(row).toContain("a");
    expect(row).toContain("f");
  });

  test("normal text is unaffected", () => {
    const buf = new ScreenBuffer(10, 1);
    buf.drawSegment(0, 0, new Segment("hello", Style.DEFAULT));
    expect(cellChars(buf, 0).trimEnd()).toBe("hello");
  });
});

describe("wide characters never spill past a boundary", () => {
  test("a wide glyph in the last column becomes a space (no overflow)", () => {
    const buf = new ScreenBuffer(3, 1);
    buf.setCell(2, 0, "世", Style.DEFAULT); // 2-cell wide, no room for column 3
    expect(buf.cells[0][2].char).toBe(" ");
    expect(buf.cells[0][2].wideContinuation).toBe(false);
  });

  test("a wide glyph with room places a continuation cell", () => {
    const buf = new ScreenBuffer(4, 1);
    buf.setCell(1, 0, "世", Style.DEFAULT);
    expect(buf.cells[0][1].char).toBe("世");
    expect(buf.cells[0][2].wideContinuation).toBe(true);
  });
});
