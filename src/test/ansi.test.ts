import { describe, expect, test } from "vitest";
import { AnsiTerminal, cellsToSegments } from "../render/rich/ansi.ts";

/** Join a terminal's grid into plain text lines. */
function plain(t: AnsiTerminal): string[] {
  return t.lines.map((cells) => cells.map((c) => c.ch).join(""));
}

describe("AnsiTerminal", () => {
  test("newlines split lines; printable text fills cells", () => {
    const t = new AnsiTerminal();
    t.write("hello\nworld");
    expect(plain(t)).toEqual(["hello", "world"]);
  });

  test("carriage return overwrites the current line in place", () => {
    const t = new AnsiTerminal();
    t.write("abc\rX");
    expect(plain(t)).toEqual(["Xbc"]);
  });

  test("SGR sets per-cell style and reset clears it", () => {
    const t = new AnsiTerminal();
    t.write("\x1b[31mr\x1b[0m.");
    expect(t.lines[0][0].ch).toBe("r");
    expect(t.lines[0][0].style.color).toBe("red");
    expect(t.lines[0][1].ch).toBe(".");
    expect(t.lines[0][1].style.color).toBeUndefined();
  });

  test("256-color and truecolor resolve to hex", () => {
    const t = new AnsiTerminal();
    t.write("\x1b[38;5;196mA\x1b[38;2;1;2;3mB");
    expect(t.lines[0][0].style.color).toBe("#ff0000");
    expect(t.lines[0][1].style.color).toBe("#010203");
  });

  test("cursor-up + carriage return rewrites an earlier line (progress redraw)", () => {
    const t = new AnsiTerminal();
    t.write("one\ntwo\x1b[1A\rZ");
    expect(plain(t)).toEqual(["Zne", "two"]);
  });

  test("erase-in-line (\\x1b[0K) clears from the cursor to end of line", () => {
    const t = new AnsiTerminal();
    t.write("abcdef\rxy\x1b[0K");
    expect(plain(t)).toEqual(["xy"]);
  });

  test("auto-wraps at the column width", () => {
    const t = new AnsiTerminal();
    t.cols = 3;
    t.write("abcdef");
    expect(plain(t)).toEqual(["abc", "def"]);
  });

  test("a wide glyph landing on the last column wraps instead of overflowing", () => {
    // Regression: the overflow check only fired when `col >= cols` *before*
    // placing the character. A double-width glyph landing exactly on the
    // last valid column (9 ASCII chars, then a 10-col viewport) passed that
    // check, got written at col 9, and its zero-width continuation cell
    // landed at col 10 -- one column past the declared width -- instead of
    // wrapping the whole glyph to the next line.
    const t = new AnsiTerminal();
    t.cols = 10;
    t.write("123456789中"); // 9 narrow chars fill cols 0-8; "中" (width 2) follows
    expect(t.lines[0].length).toBeLessThanOrEqual(10);
    expect(plain(t)).toEqual(["123456789", "中"]);
  });

  test("an escape split across writes is completed on the next chunk", () => {
    const t = new AnsiTerminal();
    t.write("\x1b[3");
    t.write("1mhi");
    expect(plain(t)).toEqual(["hi"]);
    expect(t.lines[0][0].style.color).toBe("red");
  });

  test("viewport-escaping sequences are dropped, not emitted as text", () => {
    const t = new AnsiTerminal();
    // alt-screen, erase-display, scroll-region, absolute home — all ignored.
    t.write("\x1b[?1049h\x1b[2J\x1b[1;1r\x1b[10;5HX\x1b]0;evil title\x07Y");
    const text = plain(t).join("\n");
    expect(text).toContain("X");
    expect(text).toContain("Y");
    expect(text).not.toContain("\x1b"); // no raw escapes leaked into the grid
    expect(text).not.toContain("evil title"); // OSC payload consumed
  });

  test("wide glyphs occupy their width without corrupting the run", () => {
    const t = new AnsiTerminal();
    t.write("你x");
    expect(t.lines[0].map((c) => c.ch).join("")).toBe("你x");
  });

  test("a reset combined with other SGR params in one sequence still clears them", () => {
    const t = new AnsiTerminal();
    // Bold set then reset in the same `m` sequence (ESC[1;0m), as some tools
    // emit — the reset must win, not just reset the base style it merges onto.
    t.write("\x1b[1;0mhello");
    expect(t.lines[0][0].style.bold).toBeFalsy();
  });

  test("cellsToSegments coalesces equal-style runs", () => {
    const t = new AnsiTerminal();
    t.write("\x1b[31maa\x1b[32mbb");
    const segs = cellsToSegments(t.lines[0]);
    expect(segs).toHaveLength(2);
    expect(segs[0].text).toBe("aa");
    expect(segs[1].text).toBe("bb");
  });

  test("reset() empties the grid", () => {
    const t = new AnsiTerminal();
    t.write("stuff");
    t.reset();
    expect(plain(t)).toEqual([""]);
  });

  test("cursor down / forward / back / column-absolute move within bounds", () => {
    const t = new AnsiTerminal();
    t.cols = 20;
    // down 2, then write at col 0 of row 2.
    t.write("\x1b[2BX");
    expect(plain(t)).toEqual(["", "", "X"]);
    // forward 3 then write, back 1 then write, then column 1 then write.
    t.write("\x1b[3CY\x1b[1DZ\x1b[1GQ");
    // Z lands at col 4 (forward 3 from col 1 → 4, write Y→5, back 1 → 4, write Z),
    // and column-absolute 1 puts Q at index 0.
    const row2 = t.lines[2].map((c) => c.ch).join("");
    expect(row2).toContain("Z");
    expect(t.lines[2][0].ch).toBe("Q"); // column 1 (1-based) → index 0
  });

  test("backspace and tab move the cursor", () => {
    const t = new AnsiTerminal();
    t.cols = 40;
    t.write("ab\bX"); // backspace over 'b'
    expect(plain(t)).toEqual(["aX"]);
    const t2 = new AnsiTerminal();
    t2.cols = 40;
    t2.write("a\tb"); // tab to column 8
    expect(t2.lines[0][8].ch).toBe("b");
  });

  test("erase-in-line modes 1 and 2 clear the right cells", () => {
    const t = new AnsiTerminal();
    t.write("abcdef\x1b[3D\x1b[1K"); // back 3 (to col3), erase start..cursor
    expect(t.lines[0].slice(0, 4).every((c) => c.ch === " ")).toBe(true);
    const t2 = new AnsiTerminal();
    t2.write("abcdef\x1b[2K"); // erase whole line
    expect(plain(t2)).toEqual([""]);
  });

  test("bright bg, default fg/bg, reverse, and 22 (un-bold) are handled", () => {
    const t = new AnsiTerminal();
    t.write("\x1b[1;7;101mA\x1b[22;39;49mB");
    expect(t.lines[0][0].style.bold).toBe(true);
    expect(t.lines[0][0].style.reverse).toBe(true);
    expect(t.lines[0][0].style.background).toBe("bright-red");
    expect(t.lines[0][1].style.bold).toBe(false);
    expect(t.lines[0][1].style.color).toBe("default");
  });

  test("OSC terminated by ST (ESC \\) and charset escapes are consumed", () => {
    const t = new AnsiTerminal();
    t.write("\x1b]0;title\x1b\\\x1b(BX"); // OSC…ST then ESC ( B (charset) then X
    expect(plain(t)).toEqual(["X"]);
  });

  test("maxLines trims old scrollback", () => {
    const t = new AnsiTerminal();
    t.maxLines = 3;
    t.write("a\nb\nc\nd\ne");
    expect(plain(t)).toEqual(["c", "d", "e"]);
  });

  test("dim/italic/underline/strikethrough set, then their off-codes clear", () => {
    const t = new AnsiTerminal();
    t.write("\x1b[2;3;4;9mA\x1b[23;24;29mB");
    const a = t.lines[0][0].style;
    expect(a.dim).toBe(true);
    expect(a.italic).toBe(true);
    expect(a.underline).toBe(true);
    expect(a.strikethrough).toBe(true);
    const b = t.lines[0][1].style;
    expect(b.italic).toBe(false);
    expect(b.underline).toBe(false);
    expect(b.strikethrough).toBe(false);
  });

  test("bright foreground (90–97) and reverse-off (27) resolve", () => {
    const t = new AnsiTerminal();
    t.write("\x1b[7;92mA\x1b[27mB");
    expect(t.lines[0][0].style.color).toBe("bright-green");
    expect(t.lines[0][0].style.reverse).toBe(true);
    expect(t.lines[0][1].style.reverse).toBe(false);
  });

  test("zero-width / control characters are not placed as cells", () => {
    const t = new AnsiTerminal();
    t.write("a\x00\x07b"); // NUL + BEL carry no width
    expect(plain(t)).toEqual(["ab"]);
  });

  test("a zero-width combining mark reaching putChar is dropped, not placed", () => {
    // Unlike NUL/BEL, a bare combining accent is >= " " so it reaches
    // putChar(); its stringWidth is 0, so it must still be skipped.
    const t = new AnsiTerminal();
    t.write("áb");
    expect(plain(t)).toEqual(["ab"]);
  });

  test("a bare SGR reset (no params) clears the style", () => {
    const t = new AnsiTerminal();
    t.write("\x1b[1mA\x1b[mB");
    expect(t.lines[0][0].style.bold).toBe(true);
    expect(t.lines[0][1].style.bold).toBeFalsy();
  });

  test("standard (non-bright) background colors 40-47 are handled", () => {
    const t = new AnsiTerminal();
    t.write("\x1b[44mA");
    expect(t.lines[0][0].style.background).toBe("blue");
  });

  test("unrecognized SGR params (e.g. blink) are silently ignored", () => {
    const t = new AnsiTerminal();
    t.write("\x1b[5;1mA"); // 5 = blink, unhandled; 1 = bold, handled
    expect(t.lines[0][0].style.bold).toBe(true);
  });

  test("standard 16-color and grayscale-ramp 256-color palette entries resolve", () => {
    const t = new AnsiTerminal();
    // n < 16: standard/bright palette lookup table.
    t.write("\x1b[38;5;9mA"); // bright red
    expect(t.lines[0][0].style.color).toBe("#ff0000");
    // n >= 232: grayscale ramp.
    t.write("\x1b[38;5;240mB");
    expect(t.lines[0][1].style.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  test("an extended-color mode that's neither 5 (256) nor 2 (truecolor) sets no color", () => {
    const t = new AnsiTerminal();
    t.write("\x1b[38;9mA");
    expect(t.lines[0][0].style.color).toBeUndefined();
  });

  test("missing components in extended-color sequences default to 0", () => {
    const t = new AnsiTerminal();
    t.write("\x1b[38;2mA"); // truecolor with no r/g/b at all
    expect(t.lines[0][0].style.color).toBe("#000000");
  });

  test("a malformed (empty) SGR parameter falls back to 0", () => {
    const t = new AnsiTerminal();
    t.write("\x1b[;1mA"); // leading empty segment before the real param
    expect(t.lines[0][0].style.bold).toBe(true);
  });

  test("erase-in-line with an unrecognized mode is a no-op", () => {
    const t = new AnsiTerminal();
    t.write("abc\x1b[9K"); // mode 9 matches none of 0/1/2
    expect(plain(t)).toEqual(["abc"]);
  });

  test("cursor-forward without a column limit does not clamp", () => {
    const t = new AnsiTerminal();
    // cols defaults to 0 (wrapping disabled), so forward movement is unclamped.
    t.write("\x1b[500CX");
    expect(t.lines[0][500].ch).toBe("X");
  });

  test("a bare trailing ESC (no following byte) is buffered as pending", () => {
    const t = new AnsiTerminal();
    t.write("hi\x1b");
    expect(plain(t)).toEqual(["hi"]);
    t.write("[31mZ");
    expect(t.lines[0][2].ch).toBe("Z");
    expect(t.lines[0][2].style.color).toBe("red");
  });

  test("an OSC left dangling on ESC at the very end of the chunk is buffered", () => {
    const t = new AnsiTerminal();
    t.write("\x1b]0;title\x1b");
    // Incomplete OSC terminator (ESC without the following '\\') is carried over.
    expect(plain(t)).toEqual([""]);
    t.write("\\X");
    expect(plain(t)).toEqual(["X"]);
  });

  test("a two-byte escape that isn't a charset designator is just skipped", () => {
    const t = new AnsiTerminal();
    t.write("\x1b=X"); // ESC = (keypad mode) — not [, ], (, ), *, or +
    expect(plain(t)).toEqual(["X"]);
  });

  test("an incomplete charset-designator escape at chunk end is buffered", () => {
    const t = new AnsiTerminal();
    t.write("hi\x1b(");
    expect(plain(t)).toEqual(["hi"]);
    t.write("BX");
    expect(plain(t)).toEqual(["hiX"]);
  });
});
