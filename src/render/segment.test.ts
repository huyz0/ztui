import { describe, expect, it } from "vitest";
import { charWidth, Segment, splitGraphemes, stringWidth } from "./segment.ts";

// User-perceived characters that span multiple code points.
const FAMILY = "👨‍👩‍👧"; // ZWJ sequence (man+ZWJ+woman+ZWJ+girl)
const FLAG = "🇯🇵"; // regional-indicator pair (Japan)
const SKINTONE = "👍🏽"; // thumbs-up + medium skin-tone modifier
const ACCENT = "é"; // e + combining acute => é

describe("splitGraphemes", () => {
  it("keeps ZWJ / flag / skin-tone / combining sequences whole", () => {
    expect(splitGraphemes(FAMILY)).toEqual([FAMILY]);
    expect(splitGraphemes(FLAG)).toEqual([FLAG]);
    expect(splitGraphemes(SKINTONE)).toEqual([SKINTONE]);
    expect(splitGraphemes(ACCENT)).toEqual([ACCENT]);
  });

  it("splits a mixed string into one entry per user-perceived char", () => {
    expect(splitGraphemes(`a${FAMILY}b`)).toEqual(["a", FAMILY, "b"]);
  });

  it("returns an empty array for an empty string", () => {
    expect(splitGraphemes("")).toEqual([]);
  });

  it("ASCII fast path matches one-entry-per-char (and equals the segmenter)", () => {
    const ascii = "Hello, World! 0123 (a=b)";
    expect(splitGraphemes(ascii)).toEqual(ascii.split(""));
    // A string that is ASCII except for one non-ASCII char must NOT take the
    // fast path — it still clusters correctly.
    expect(splitGraphemes(`ab${ACCENT}c`)).toEqual(["a", "b", ACCENT, "c"]);
  });
});

describe("charWidth (cached for non-ASCII)", () => {
  it("returns 1 for printable ASCII, 0 for control chars", () => {
    expect(charWidth("A")).toBe(1);
    expect(charWidth(" ")).toBe(1);
    expect(charWidth("\n")).toBe(0);
  });

  it("widths box-drawing glyphs as 1 and CJK as 2, consistently across calls", () => {
    for (const g of ["─", "│", "╭", "╯"]) {
      expect(charWidth(g)).toBe(1);
      expect(charWidth(g)).toBe(1); // cache hit returns the same value
    }
    expect(charWidth("世")).toBe(2);
    expect(charWidth("世")).toBe(2);
  });

  it("widths emoji clusters as a single wide glyph (cache-safe)", () => {
    expect(charWidth(FAMILY)).toBe(2);
    expect(charWidth(FAMILY)).toBe(2);
  });
});

describe("stringWidth", () => {
  it("counts a combining accent as one cell, not two", () => {
    expect(stringWidth(ACCENT)).toBe(1);
    expect(stringWidth(`caf${ACCENT}`)).toBe(4);
  });

  it("counts an emoji cluster as a single wide (2-cell) glyph", () => {
    expect(stringWidth(FAMILY)).toBe(2);
    expect(stringWidth(FLAG)).toBe(2);
    expect(stringWidth(SKINTONE)).toBe(2);
  });

  it("agrees with summed per-grapheme charWidth", () => {
    const s = `x${FAMILY}${ACCENT}漢`;
    const summed = splitGraphemes(s).reduce((a, g) => a + charWidth(g), 0);
    expect(stringWidth(s)).toBe(summed);
  });
});

describe("Segment.crop", () => {
  it("does not split a multi-codepoint emoji across the crop boundary", () => {
    // "ab" + family emoji (width 2). Cropping [0,3) keeps "ab" and the emoji
    // would start at col 2 and end at col 4 — past the boundary — so it becomes
    // a single space, never a half-emoji.
    const seg = new Segment(`ab${FAMILY}`);
    expect(seg.cellLength).toBe(4);
    expect(seg.crop(0, 3).text).toBe("ab ");
  });

  it("keeps an emoji that fits entirely within the crop", () => {
    const seg = new Segment(`a${FAMILY}b`);
    expect(seg.crop(0, 3).text).toBe(`a${FAMILY}`);
  });

  it("a zero-width crop window straddling a wide glyph emits no cells at all", () => {
    // "あ" (width 2) starts before startCell=1 and extends into it, but the
    // requested window [1,1) is empty — nothing should render, not a stray
    // padding space outside the requested range.
    const seg = new Segment("あX");
    expect(seg.crop(1, 1).text).toBe("");
    expect(seg.crop(1, 1).cellLength).toBe(0);
  });

  it("an inverted (negative-width) crop window also emits no cells", () => {
    const seg = new Segment("あX");
    expect(seg.crop(2, 1).text).toBe("");
  });
});
