import { describe, expect, test } from "vitest";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { ScreenBuffer } from "./buffer.ts";
import { Segment } from "./segment.ts";
import { Style } from "./style.ts";

describe("rendering system", () => {
  test("Style escape codes", () => {
    const s = new Style({ color: "red", bold: true });
    const { start, end } = s.getEscapeCodes();
    expect(start.includes("\x1b[31m")).toBe(true);
    expect(start.includes("\x1b[1m")).toBe(true);
    expect(end.includes("\x1b[39m")).toBe(true);
    expect(end.includes("\x1b[22m")).toBe(true);
  });

  test("Segment cell length and cropping", () => {
    const s = new Segment("Hello 🌟"); // 🌟 is wide, so length is 5 + 1 (space) + 2 = 8
    expect(s.cellLength).toBe(8);

    const cropped = s.crop(0, 6); // Fits "Hello "
    expect(cropped.text).toBe("Hello ");
  });

  test("ScreenBuffer rendering and diffing", () => {
    const b1 = new ScreenBuffer(10, 2);
    const b2 = new ScreenBuffer(10, 2); // Empty buffer

    b1.drawSegment(0, 0, new Segment("Hello"));

    const diff = b1.renderDiff(b2);
    // Diff should contain the cursor move code for row 1 (\x1b[1;1H) and the word "Hello"
    expect(diff.includes("\x1b[1;1H")).toBe(true);
    expect(diff.includes("Hello")).toBe(true);
  });

  test("ScreenBuffer size mismatch diffing and clipping", () => {
    const b1 = new ScreenBuffer(5, 2);
    const b2 = new ScreenBuffer(10, 2); // mismatching size!
    b1.drawSegment(0, 0, new Segment("Hello"));

    // This should trigger size mismatch fallback rendering
    const diff = b1.renderDiff(b2);
    expect(diff).toBeDefined();

    // Test clipping
    const b3 = new ScreenBuffer(10, 2);
    b3.drawSegment(0, 0, new Segment("Hello"), new Region(new Offset(2, 0), new Size(3, 1)));
    expect(b3.cells[0][0].char).toBe(" "); // Clipped out
    expect(b3.cells[0][2].char).toBe("l"); // Kept
  });

  test("Style color parser, formatting, and extra decorations", () => {
    // Test RGB colors
    const s1 = new Style({ color: "rgb(255, 0, 0)", background: "rgb(0, 0, 255)" });
    const c1 = s1.getEscapeCodes();
    expect(c1.start.includes("38;2;255;0;0")).toBe(true);
    expect(c1.start.includes("48;2;0;0;255")).toBe(true);

    // Test Hex colors
    const s2 = new Style({ color: "#ff00bb", background: "#00ff00" });
    const c2 = s2.getEscapeCodes();
    expect(c2.start.includes("38;2;255;0;187")).toBe(true);
    expect(c2.start.includes("48;2;0;255;0")).toBe(true);

    // Test extra decorations
    const s3 = new Style({
      color: "red",
      bold: true,
      dim: true,
      italic: true,
      underline: true,
      reverse: true,
    });
    const c3 = s3.getEscapeCodes();
    expect(c3.start.includes("\x1b[31m")).toBe(true);
    expect(c3.start.includes("\x1b[2m")).toBe(true); // dim
    expect(c3.start.includes("\x1b[3m")).toBe(true); // italic
    expect(c3.start.includes("\x1b[4m")).toBe(true); // underline
    expect(c3.start.includes("\x1b[7m")).toBe(true); // reverse

    // Test invalid hex fallback
    const s4 = new Style({ color: "#invalidhex", background: "badcolor" });
    const c4 = s4.getEscapeCodes();
    expect(c4.start).toBe("");

    // Test short hex
    const s5 = new Style({ color: "#abc", background: "#f0f" });
    const c5 = s5.getEscapeCodes();
    expect(c5.start.includes("38;2;170;187;204")).toBe(true);
  });
});
