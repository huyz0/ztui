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

  test("overwriting a wide glyph's continuation cell clears the orphaned main cell", () => {
    const buf = new ScreenBuffer(10, 1);
    buf.setCell(2, 0, "世", Style.DEFAULT); // main at 2, continuation at 3
    buf.setCell(3, 0, "X", Style.DEFAULT); // an overlay repaints just column 3
    expect(buf.cells[0][2].char).toBe(" ");
    expect(buf.cells[0][2].wideContinuation).toBe(false);
    expect(buf.cells[0][3].char).toBe("X");
    expect(buf.cells[0][3].wideContinuation).toBe(false);
  });

  test("overwriting a wide glyph's main cell with a narrow char clears the orphaned continuation cell", () => {
    const buf = new ScreenBuffer(10, 1);
    buf.setCell(2, 0, "世", Style.DEFAULT); // main at 2, continuation at 3
    buf.setCell(2, 0, "y", Style.DEFAULT); // an overlay repaints just column 2
    expect(buf.cells[0][2].char).toBe("y");
    expect(buf.cells[0][2].wideContinuation).toBe(false);
    expect(buf.cells[0][3].char).toBe(" ");
    expect(buf.cells[0][3].wideContinuation).toBe(false);
  });

  test("writing a new wide glyph over an old one's continuation clears the old main", () => {
    const buf = new ScreenBuffer(10, 1);
    buf.setCell(2, 0, "世", Style.DEFAULT); // main at 2, continuation at 3
    buf.setCell(3, 0, "界", Style.DEFAULT); // a new wide glyph starts where the old continuation was
    expect(buf.cells[0][2].char).toBe(" ");
    expect(buf.cells[0][2].wideContinuation).toBe(false);
    expect(buf.cells[0][3].char).toBe("界");
    expect(buf.cells[0][4].wideContinuation).toBe(true);
  });
});

describe("buffer cell reuse (allocation-free)", () => {
  test("setCell mutates the existing cell object in place", () => {
    const buf = new ScreenBuffer(3, 1);
    const ref = buf.cells[0][0];
    buf.setCell(0, 0, "a", new Style({ color: "#ff0000" }));
    expect(ref.char).toBe("a"); // same object, updated in place
    expect(buf.cells[0][0]).toBe(ref);
    buf.setCell(0, 0, "b", new Style({ color: "#00ff00" }));
    expect(ref.char).toBe("b");
    expect(buf.cells[0][0]).toBe(ref);
  });

  test("setCell clears a stale icon/graphic when overwriting a cell", () => {
    const buf = new ScreenBuffer(2, 1);
    buf.cells[0][0].icon = "star";
    buf.setCell(0, 0, "x", Style.DEFAULT);
    expect(buf.cells[0][0].icon).toBeUndefined();
  });

  test("copyTo reproduces contents into a reused destination grid", () => {
    const a = new ScreenBuffer(3, 1);
    a.setCell(0, 0, "h", new Style({ color: "#abcdef" }));
    a.setCell(1, 0, "i", Style.DEFAULT);
    const b = new ScreenBuffer(3, 1);
    const dstRef = b.cells[0][0];
    a.copyTo(b);
    expect(b.cells[0][0].char).toBe("h");
    expect(b.cells[0][1].char).toBe("i");
    expect(b.cells[0][0].style.color).toBe("#abcdef");
    expect(b.cells[0][0]).toBe(dstRef); // destination cell objects reused
  });
});

describe("graphics tracking", () => {
  test("noteGraphic sets containsGraphics and a position-dependent signature", () => {
    const a = new ScreenBuffer(10, 5);
    expect(a.containsGraphics).toBe(false);
    expect(a.graphicSignature).toBe(0);
    a.noteGraphic(2, 1);
    expect(a.containsGraphics).toBe(true);
    const sigA = a.graphicSignature;
    expect(sigA).not.toBe(0);

    // Same position → same signature (commutative, order-independent).
    const b = new ScreenBuffer(10, 5);
    b.noteGraphic(2, 1);
    expect(b.graphicSignature).toBe(sigA);

    // A different position → different signature (so a moved graphic is detected).
    const c = new ScreenBuffer(10, 5);
    c.noteGraphic(3, 1);
    expect(c.graphicSignature).not.toBe(sigA);

    // Order independence: {(2,1),(5,3)} hashes the same regardless of visit order.
    const d = new ScreenBuffer(10, 5);
    d.noteGraphic(2, 1);
    d.noteGraphic(5, 3);
    const e = new ScreenBuffer(10, 5);
    e.noteGraphic(5, 3);
    e.noteGraphic(2, 1);
    expect(d.graphicSignature).toBe(e.graphicSignature);
  });
});

describe("differsFrom — encoding-free change detection", () => {
  test("identical buffers do not differ; one changed cell does", () => {
    const a = new ScreenBuffer(10, 4);
    const b = new ScreenBuffer(10, 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 10; x++) {
        const ch = String.fromCharCode(65 + ((x + y) % 26));
        a.setCell(x, y, ch, Style.DEFAULT);
        b.setCell(x, y, ch, Style.DEFAULT);
      }
    }
    expect(a.differsFrom(b)).toBe(false);

    b.setCell(4, 2, "Z", new Style({ bold: true }));
    expect(a.differsFrom(b)).toBe(true);
    // Scoped to a band that excludes the change → reports no difference.
    expect(a.differsFrom(b, 0, 2)).toBe(false);
    expect(a.differsFrom(b, 2, 3)).toBe(true);
  });

  test("a size mismatch always differs", () => {
    const a = new ScreenBuffer(10, 4);
    const b = new ScreenBuffer(12, 4);
    expect(a.differsFrom(b)).toBe(true);
  });
});
