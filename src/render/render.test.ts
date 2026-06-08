import { describe, expect, test } from "vitest";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { ScreenBuffer } from "./buffer.ts";
import { renderBufferToHTML } from "./html-renderer.ts";
import { Segment } from "./segment.ts";
import { renderCapabilities, Style } from "./style.ts";

function debugRender(buffer: ScreenBuffer): string {
  let output = "";
  for (let y = 0; y < buffer.height; y++) {
    for (let x = 0; x < buffer.width; x++) {
      const cell = buffer.cells[y][x];
      if (cell.wideContinuation) continue;
      const { start } = cell.style.getEscapeCodes();
      output += start ? `[C:${cell.char}]` : cell.char;
    }
    output += "\n";
  }
  return output;
}

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
    renderCapabilities.truecolor = true;
    renderCapabilities.color256 = true;

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

  test("Color fallback and degradation modes", () => {
    // 1. 256-color fallback mode
    renderCapabilities.truecolor = false;
    renderCapabilities.color256 = true;

    const s256 = new Style({ color: "#ff0000", background: "#00ff00" });
    const c256 = s256.getEscapeCodes();
    // #ff0000 maps to 256-color index 196
    expect(c256.start.includes("38;5;196m")).toBe(true);
    // #00ff00 maps to 256-color index 46
    expect(c256.start.includes("48;5;46m")).toBe(true);

    // 2. Monochrome / 16-color fallback mode
    renderCapabilities.truecolor = false;
    renderCapabilities.color256 = false;

    const s16 = new Style({ color: "#ff0000", background: "#0000ff" });
    const c16 = s16.getEscapeCodes();
    // #ff0000 maps to closest basic red (91m for bright red)
    expect(
      c16.start.includes("30m") || c16.start.includes("31m") || c16.start.includes("91m"),
    ).toBe(true);
    // #0000ff maps to closest basic blue (92m or 34m)
    expect(
      c16.start.includes("40m") || c16.start.includes("44m") || c16.start.includes("104m"),
    ).toBe(true);

    // Reset standard capabilities
    renderCapabilities.truecolor = true;
    renderCapabilities.color256 = true;
  });

  test("OSC 8 Hyperlinks & HTML rendering", () => {
    const linkUrl = "https://ghostty.org";
    const s = new Style({ color: "green", link: linkUrl });
    const { start, end } = s.getEscapeCodes();

    // Verify hyperlink control sequences
    expect(start.includes(`\x1b]8;;${linkUrl}\x1b\\`)).toBe(true);
    expect(end.includes("\x1b]8;;\x1b\\")).toBe(true);

    // Verify HTML wrapping in renderer
    const buffer = new ScreenBuffer(15, 1);
    buffer.drawSegment(0, 0, new Segment("Ghostty", s));
    const html = renderBufferToHTML(buffer);

    expect(html.includes(`<a href="${linkUrl}" target="_blank"`)).toBe(true);
    expect(html.includes("Ghostty")).toBe(true);
  });

  test("ScreenBuffer renderDiff splits contiguous runs on style boundaries", () => {
    const b1 = new ScreenBuffer(10, 1);
    const b2 = new ScreenBuffer(10, 1);

    const s1 = new Style({ color: "red" });
    const s2 = new Style({ color: "blue" });

    // Draw adjacent characters with different styles
    b1.setCell(0, 0, "A", s1);
    b1.setCell(1, 0, "B", s2);

    const diff = b1.renderDiff(b2);

    // Verifies that both A and B are rendered using their own styles, not a single style for the run
    expect(diff.includes("\x1b[31m")).toBe(true); // red (Style 1)
    expect(diff.includes("\x1b[34m")).toBe(true); // blue (Style 2)

    // Verify debugRender execution
    const output = debugRender(b1);
    expect(output.includes("[C:A]")).toBe(true);
    expect(output.includes("[C:B]")).toBe(true);
  });

  test("ScreenBuffer renderDiff does not emit cursor movements for adjacent runs of different styles", () => {
    const b1 = new ScreenBuffer(10, 1);
    const b2 = new ScreenBuffer(10, 1);

    const s1 = new Style({ color: "red" });
    const s2 = new Style({ color: "blue" });

    b1.setCell(0, 0, "A", s1);
    b1.setCell(1, 0, "B", s2);

    const diff = b1.renderDiff(b2);

    // Initial cursor move to (1,1) should be present
    expect(diff.includes("\x1b[1;1H")).toBe(true);
    // There should NOT be any cursor move to (1,2) like \x1b[1;2H
    expect(diff.includes("\x1b[1;2H")).toBe(false);
  });

  test("ScreenBuffer renderDiff invalidates main cell when wide continuation cell reverts to graphic/wide char", () => {
    const b1 = new ScreenBuffer(10, 1);
    const b2 = new ScreenBuffer(10, 1);

    const s = new Style();
    // Frame 1: Draw icon
    b2.cells[0][0] = { char: "I", style: s, wideContinuation: false, icon: "test-icon" };
    b2.cells[0][1] = { char: "", style: s, wideContinuation: true };

    // Frame 2: Overwrite cell 2 with character X
    b2.cells[0][1] = { char: "X", style: s, wideContinuation: false };

    // Frame 3: Revert cell 2 back to wideContinuation
    b1.cells[0][0] = { char: "I", style: s, wideContinuation: false, icon: "test-icon" };
    b1.cells[0][1] = { char: "", style: s, wideContinuation: true };

    // This should force redraw of cell 1 (I)
    const diff = b1.renderDiff(b2);
    expect(diff.includes("I")).toBe(true);
  });

  test("Strikethrough rendering and HTML conversion", () => {
    const s1 = new Style({ strikethrough: true });
    const c1 = s1.getEscapeCodes();
    expect(c1.start.includes("\x1b[9m")).toBe(true);
    expect(c1.end.includes("\x1b[29m")).toBe(true);

    // HTML Renderer with strikethrough
    const buffer = new ScreenBuffer(10, 1);
    buffer.drawSegment(0, 0, new Segment("Struck", s1));
    const html1 = renderBufferToHTML(buffer);
    expect(html1.includes("text-decoration: line-through")).toBe(true);

    // HTML Renderer combining underline and strikethrough
    const s2 = new Style({ underline: true, strikethrough: true });
    const buffer2 = new ScreenBuffer(10, 1);
    buffer2.drawSegment(0, 0, new Segment("Both", s2));
    const html2 = renderBufferToHTML(buffer2);
    expect(html2.includes("text-decoration: underline line-through")).toBe(true);
  });
});
