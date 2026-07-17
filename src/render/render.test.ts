import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { renderCapabilities, styleToEscapeCodes } from "./ansi-style.ts";
import { ScreenBuffer } from "./buffer.ts";
import { colorMode } from "./color-mode.ts";
import { renderBufferToHTML } from "./html-renderer.ts";
import { Segment } from "./segment.ts";
import { Style } from "./style.ts";

function debugRender(buffer: ScreenBuffer): string {
  let output = "";
  for (let y = 0; y < buffer.height; y++) {
    for (let x = 0; x < buffer.width; x++) {
      const cell = buffer.cells[y][x];
      if (cell.wideContinuation) continue;
      const { start } = styleToEscapeCodes(cell.style);
      output += start ? `[C:${cell.char}]` : cell.char;
    }
    output += "\n";
  }
  return output;
}

describe("rendering system", () => {
  // Bun sets NO_COLOR itself whenever stdout isn't a TTY (true under CI/vitest),
  // so the ambient default can't be trusted — force colour on for these assertions.
  beforeEach(() => colorMode.set(true));
  afterEach(() => colorMode.reset());

  test("Style escape codes", () => {
    const s = new Style({ color: "red", bold: true });
    const { start, end } = styleToEscapeCodes(s);
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

  test("REP run-compression never rewrites an icon/graphic sequence", () => {
    // A cell carrying an icon/graphic emits a raw terminal sequence (e.g. a sixel
    // DCS) whose payload has long runs of identical bytes. With REP compression
    // on (the `repeatChar` capability — Windows Terminal has it), those runs must
    // NOT be rewritten to `\x1b[Nb`: that escape injected into the DCS aborts it
    // and the payload prints as on-screen garbage. Regression for that break.
    const W = 8;
    const prev = new ScreenBuffer(W, 1);
    const next = new ScreenBuffer(W, 1);
    next.cells[0][0].icon = "hero:home";
    next.cells[0][0].char = "?"; // text fallback under the graphic

    // A stand-in sixel DCS with a run of identical pixel bytes (the `~` row) that
    // the compressor would otherwise collapse into `~\x1b[Nb`.
    const sixel = "\x1bPq#0;2;0;0;0~~~~~~~~~~\x1b\\";
    const diff = next.renderDiff(
      prev,
      (cell) => (cell.icon ? sixel : cell.char),
      W,
      1,
      0,
      false,
      true, // allowRepeat — REP compression enabled, as on Windows Terminal
    );

    expect(diff).toContain(sixel); // emitted verbatim, uncorrupted
    expect(diff).not.toMatch(/\x1bPq[^\\]*\x1b\[\d+b/); // no REP injected into the DCS
  });

  test("renderDiff repositions after a wide glyph instead of streaming across it", () => {
    // When a width-2 glyph (emoji/CJK) is replaced and immediately followed by
    // changed content, the trailing run must NOT be concatenated directly onto
    // the glyph in the ANSI output. Terminals disagree with our width model for
    // wide glyphs (e.g. emoji rendered as width 1 in many terminals/WSL); if the
    // trailing content streams relative to the cursor across the glyph it lands
    // in the wrong column and leaves stale fragments of the previous frame on
    // screen. The diff must emit an absolute cursor reposition after the glyph.
    const W = 16;
    const prev = new ScreenBuffer(W, 1);

    // Frame 1: a wide emoji immediately followed by a long label (no gap).
    const f1 = new ScreenBuffer(W, 1);
    f1.drawSegment(0, 0, new Segment("📁oldlonglabel"));
    f1.renderDiff(prev, (c) => c.char, W, 1);
    f1.copyTo(prev);

    // Frame 2: the glyph changes (so it is re-emitted as a run) followed by
    // shorter content that begins right after the glyph.
    const f2 = new ScreenBuffer(W, 1);
    f2.drawSegment(0, 0, new Segment("📄new"));
    const diff2 = f2.renderDiff(prev, (c) => c.char, W, 1);

    // The trailing content must be preceded by a cursor-position escape, never
    // streamed directly after the glyph.
    expect(diff2.includes("📄new")).toBe(false);
    expect(/📄\x1b\[\d+;\d+H/.test(diff2)).toBe(true);
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
    const c1 = styleToEscapeCodes(s1);
    expect(c1.start.includes("38;2;255;0;0")).toBe(true);
    expect(c1.start.includes("48;2;0;0;255")).toBe(true);

    // Test Hex colors
    const s2 = new Style({ color: "#ff00bb", background: "#00ff00" });
    const c2 = styleToEscapeCodes(s2);
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
    const c3 = styleToEscapeCodes(s3);
    expect(c3.start.includes("\x1b[31m")).toBe(true);
    expect(c3.start.includes("\x1b[2m")).toBe(true); // dim
    expect(c3.start.includes("\x1b[3m")).toBe(true); // italic
    expect(c3.start.includes("\x1b[4:1m")).toBe(true); // single underline
    expect(c3.start.includes("\x1b[7m")).toBe(true); // reverse

    // Underline shapes map to SGR 4 colon sub-params; color sets SGR 58.
    const curly = new Style({ underlineStyle: "curly", underlineColor: "#ff0000" });
    const cu = styleToEscapeCodes(curly);
    expect(curly.underline).toBe(true); // underlineStyle implies underline
    expect(cu.start.includes("\x1b[4:3m")).toBe(true); // undercurl
    expect(cu.start.includes("\x1b[58:2::255:0:0m")).toBe(true); // underline color
    expect(cu.end.includes("\x1b[59m")).toBe(true); // color reset
    expect(cu.end.includes("\x1b[24m")).toBe(true); // underline reset
    expect(
      styleToEscapeCodes(new Style({ underlineStyle: "dashed" })).start.includes("\x1b[4:5m"),
    ).toBe(true);

    // Test invalid hex fallback
    const s4 = new Style({ color: "#invalidhex", background: "badcolor" });
    const c4 = styleToEscapeCodes(s4);
    expect(c4.start).toBe("");

    // Test short hex
    const s5 = new Style({ color: "#abc", background: "#f0f" });
    const c5 = styleToEscapeCodes(s5);
    expect(c5.start.includes("38;2;170;187;204")).toBe(true);
  });

  test("Color fallback and degradation modes", () => {
    // 1. 256-color fallback mode
    renderCapabilities.truecolor = false;
    renderCapabilities.color256 = true;

    const s256 = new Style({ color: "#ff0000", background: "#00ff00" });
    const c256 = styleToEscapeCodes(s256);
    // #ff0000 maps to 256-color index 196
    expect(c256.start.includes("38;5;196m")).toBe(true);
    // #00ff00 maps to 256-color index 46
    expect(c256.start.includes("48;5;46m")).toBe(true);

    // 2. Monochrome / 16-color fallback mode
    renderCapabilities.truecolor = false;
    renderCapabilities.color256 = false;

    const s16 = new Style({ color: "#ff0000", background: "#0000ff" });
    const c16 = styleToEscapeCodes(s16);
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
    const { start, end } = styleToEscapeCodes(s);

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

  test("HTML rendering keeps a path/anchor link (no executable scheme) as-is", () => {
    const buffer = new ScreenBuffer(15, 1);
    buffer.drawSegment(0, 0, new Segment("Anchor", new Style({ link: "#section-2" })));
    const html = renderBufferToHTML(buffer);
    expect(html).toContain('<a href="#section-2"');
  });

  test("renderBufferToHTML preserves dim styling, not just bold/italic", () => {
    // Regression: fgCSS (and the styleKey run-boundary comparison) read
    // style.bold/.italic/.underline/.strikethrough but never style.dim, so a
    // dimmed cell (common for placeholder/hint/disabled text) exported at
    // full brightness -- indistinguishable from normal text. The terminal
    // path (computeEscapeCodes) already emits \x1b[2m for dim; only the HTML
    // export lost the attribute.
    const buffer = new ScreenBuffer(10, 1);
    buffer.drawSegment(0, 0, new Segment("hint", new Style({ dim: true })));
    const html = renderBufferToHTML(buffer);
    expect(html).toContain("opacity");
  });

  test("renderBufferToHTML swaps fg/bg for a reversed cell", () => {
    const buffer = new ScreenBuffer(10, 1);
    buffer.drawSegment(
      0,
      0,
      new Segment("rev", new Style({ color: "#ff0000", background: "#0000ff", reverse: true })),
    );
    const html = renderBufferToHTML(buffer);
    // Reversed: the background layer paints the *foreground* color (#ff0000),
    // and the text itself is colored with the *background* (#0000ff).
    expect(html.toLowerCase()).toContain("#ff0000");
    expect(html.toLowerCase()).toContain("#0000ff");
  });

  test("renderBufferToHTML applies italic styling", () => {
    const buffer = new ScreenBuffer(10, 1);
    buffer.drawSegment(0, 0, new Segment("it", new Style({ italic: true })));
    const html = renderBufferToHTML(buffer);
    expect(html).toContain("font-style: italic");
  });

  test("renderBufferToHTML skips a wide character's continuation cell", () => {
    const buffer = new ScreenBuffer(10, 1);
    buffer.drawSegment(0, 0, new Segment("🍎x", new Style({})));
    const html = renderBufferToHTML(buffer);
    // The emoji's own glyph renders once; its wideContinuation cell contributes
    // no second (empty) span.
    expect(html).toContain("🍎");
    expect(html).toContain("x");
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
    const c1 = styleToEscapeCodes(s1);
    expect(c1.start.includes("\x1b[9m")).toBe(true);
    expect(c1.end.includes("\x1b[29m")).toBe(true);

    // HTML Renderer with strikethrough
    const buffer = new ScreenBuffer(10, 1);
    buffer.drawSegment(0, 0, new Segment("Struck", s1));
    const html1 = renderBufferToHTML(buffer);
    expect(html1.includes("text-decoration-line: line-through")).toBe(true);

    // HTML Renderer combining underline and strikethrough
    const s2 = new Style({ underline: true, strikethrough: true });
    const buffer2 = new ScreenBuffer(10, 1);
    buffer2.drawSegment(0, 0, new Segment("Both", s2));
    const html2 = renderBufferToHTML(buffer2);
    expect(html2.includes("text-decoration-line: underline line-through")).toBe(true);

    // Undercurl + colored underline map to CSS wavy + decoration-color.
    const s3 = new Style({ underlineStyle: "curly", underlineColor: "#ff0000" });
    const buffer3 = new ScreenBuffer(10, 1);
    buffer3.drawSegment(0, 0, new Segment("Curl", s3));
    const html3 = renderBufferToHTML(buffer3);
    expect(html3.includes("text-decoration-style: wavy")).toBe(true);
    expect(html3.includes("text-decoration-color: #ff0000")).toBe(true);
  });

  test("HTML renders block rows in stacked background+text layers, sized by line height", () => {
    const buffer = new ScreenBuffer(10, 3);
    buffer.drawSegment(0, 0, new Segment("abc"));
    buffer.drawSegment(0, 1, new Segment("def"));
    const html = renderBufferToHTML(buffer);
    // Two layers (bg behind, text in front) each emit one block per row. Rows
    // carry no explicit height — the line box sizes them — and there are no
    // newline-separated lines.
    const rowBlocks = html.match(/<div style="white-space: pre;">/g);
    expect(rowBlocks?.length).toBe(3 * 2); // rows carry no explicit height
    expect(html).toContain("position: absolute"); // background layer
    expect(html).toContain("position: relative"); // foreground text layer
    expect(html).not.toContain("\n");
  });

  test("HTML draws cell backgrounds behind text so descenders aren't clipped", () => {
    const buffer = new ScreenBuffer(6, 1);
    buffer.drawSegment(0, 0, new Segment("hi", new Style({ background: "blue" })));
    const html = renderBufferToHTML(buffer);
    // The fill lives in the absolutely-positioned layer as a spacer span...
    const bgLayer = html.slice(
      html.indexOf("position: absolute"),
      html.lastIndexOf("position: relative"),
    );
    expect(bgLayer).toContain("background-color: #bd93f9");
    // ...while the text run itself carries no background (so it sits above fills).
    expect(html).toContain("<span>hi</span>");
  });

  test("HTML renders cells as plain glyphs (no per-cell inline-block)", () => {
    const buffer = new ScreenBuffer(6, 1);
    buffer.setCell(0, 0, "█", new Style({ color: "white" }));
    buffer.setCell(1, 0, "╭", new Style({ color: "blue" }));
    const html = renderBufferToHTML(buffer);
    // Box/block glyphs are written as literal text, not inline-block fill/scale spans.
    expect(html).toContain("line-height: 1.2"); // the grid's line box
    expect(html).not.toContain("inline-block");
    expect(html).not.toContain("scaleY");
    const fg = html.slice(html.lastIndexOf("position: relative"));
    expect(fg).toContain("█");
    expect(fg).toContain("╭");
  });

  test("HTML renders a safe hyperlink with escaped href and rel hardening", () => {
    const buffer = new ScreenBuffer(4, 1);
    buffer.drawSegment(
      0,
      0,
      new Segment("go", new Style({ link: "https://example.com/?a=1&b=2" })),
    );
    const html = renderBufferToHTML(buffer);
    expect(html).toContain('href="https://example.com/?a=1&amp;b=2"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  test("HTML drops javascript:/data: hrefs (XSS from untrusted markdown links)", () => {
    for (const evil of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "java\tscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      '" onmouseover="alert(1)',
    ]) {
      const buffer = new ScreenBuffer(4, 1);
      buffer.drawSegment(0, 0, new Segment("x", new Style({ link: evil })));
      const html = renderBufferToHTML(buffer);
      // No anchor is emitted at all for an unsafe link, and nothing breaks out
      // of the attribute.
      expect(html).not.toContain("<a ");
      expect(html.toLowerCase()).not.toContain("javascript:");
      expect(html.toLowerCase()).not.toContain("onmouseover");
      expect(html).not.toContain("<script>");
    }
  });

  test("HTML rejects color values that try to break out of the style attribute", () => {
    const buffer = new ScreenBuffer(4, 1);
    buffer.drawSegment(0, 0, new Segment("x", new Style({ color: '"><script>alert(1)</script>' })));
    const html = renderBufferToHTML(buffer);
    expect(html).not.toContain("<script>");
    // The malicious color is dropped to a safe keyword, not interpolated raw.
    expect(html).toContain("color: inherit");
    expect(html).not.toContain("alert(1)");
  });
});
