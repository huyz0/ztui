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
});
