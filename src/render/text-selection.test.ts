import { describe, expect, test } from "vitest";
import {
  comparePos,
  deleteRange,
  extractLinear,
  extractSelection,
  insertAt,
  normalizeRange,
  orderPair,
  wordRangeAt,
} from "./text-selection.ts";

describe("text-selection — linear helpers", () => {
  test("normalizeRange orders anchor/caret either way", () => {
    expect(normalizeRange(2, 5)).toEqual([2, 5]);
    expect(normalizeRange(5, 2)).toEqual([2, 5]);
    expect(normalizeRange(3, 3)).toEqual([3, 3]);
  });

  test("extractLinear slices the grapheme array", () => {
    const chars = [..."hello world"];
    expect(extractLinear(chars, 0, 5)).toBe("hello");
    expect(extractLinear(chars, 6, 11)).toBe("world");
    expect(extractLinear(chars, 3, 3)).toBe("");
  });

  test("extractLinear is astral-safe", () => {
    const chars = [..."a😀b"]; // 3 graphemes
    expect(chars.length).toBe(3);
    expect(extractLinear(chars, 0, 2)).toBe("a😀");
  });

  describe("wordRangeAt (double-click word bounds)", () => {
    const chars = [..."the quick  fox"]; // two spaces between quick and fox
    const word = (col: number) => extractLinear(chars, ...wordRangeAt(chars, col));

    test("a click inside a word selects that whole word", () => {
      expect(word(0)).toBe("the");
      expect(word(2)).toBe("the");
      expect(word(4)).toBe("quick");
      expect(word(8)).toBe("quick");
    });

    test("a click in whitespace selects the whitespace run, not a word", () => {
      expect(word(9)).toBe("  ");
    });

    test("a click at the end belongs to the last word", () => {
      expect(word(chars.length)).toBe("fox");
    });

    test("empty input yields an empty range", () => {
      expect(wordRangeAt([], 0)).toEqual([0, 0]);
    });
  });
});

describe("text-selection — 2D helpers", () => {
  test("comparePos orders by row then col", () => {
    expect(comparePos({ row: 0, col: 5 }, { row: 1, col: 0 })).toBeLessThan(0);
    expect(comparePos({ row: 2, col: 1 }, { row: 2, col: 0 })).toBeGreaterThan(0);
    expect(comparePos({ row: 1, col: 1 }, { row: 1, col: 1 })).toBe(0);
  });

  test("orderPair returns earlier position first", () => {
    const a = { row: 2, col: 0 };
    const b = { row: 1, col: 4 };
    expect(orderPair(a, b)).toEqual([b, a]);
    expect(orderPair(b, a)).toEqual([b, a]);
  });

  test("extractSelection same row", () => {
    const lines = ["hello", "world"];
    expect(extractSelection(lines, { row: 0, col: 1 }, { row: 0, col: 4 })).toBe("ell");
  });

  test("extractSelection across rows joins with newline", () => {
    const lines = ["hello", "brave", "world"];
    const got = extractSelection(lines, { row: 0, col: 3 }, { row: 2, col: 2 });
    expect(got).toBe("lo\nbrave\nwo");
  });

  test("deleteRange same row removes span", () => {
    const lines = ["hello world"];
    const out = deleteRange(lines, { row: 0, col: 5 }, { row: 0, col: 11 });
    expect(out).toEqual(["hello"]);
  });

  test("deleteRange across rows merges boundary lines", () => {
    const lines = ["hello", "brave", "world"];
    const out = deleteRange(lines, { row: 0, col: 2 }, { row: 2, col: 3 });
    expect(out).toEqual(["held"]);
  });

  test("deleteRange does not mutate the input", () => {
    const lines = ["abc", "def"];
    deleteRange(lines, { row: 0, col: 0 }, { row: 1, col: 1 });
    expect(lines).toEqual(["abc", "def"]);
  });

  test("insertAt single-line inserts and advances caret", () => {
    const { lines, caret } = insertAt(["hello"], { row: 0, col: 5 }, " world");
    expect(lines).toEqual(["hello world"]);
    expect(caret).toEqual({ row: 0, col: 11 });
  });

  test("insertAt multi-line splits the target line", () => {
    const { lines, caret } = insertAt(["ab cd"], { row: 0, col: 3 }, "X\nY\nZ");
    expect(lines).toEqual(["ab X", "Y", "Zcd"]);
    expect(caret).toEqual({ row: 2, col: 1 });
  });

  test("insertAt treats bare CR and CRLF as line breaks (native paste)", () => {
    // Bracketed paste often delivers newlines as a lone \r.
    expect(insertAt([""], { row: 0, col: 0 }, "a\rb\rc").lines).toEqual(["a", "b", "c"]);
    expect(insertAt([""], { row: 0, col: 0 }, "a\r\nb").lines).toEqual(["a", "b"]);
  });
});

describe("text-selection — grapheme clusters count as one column", () => {
  const FAMILY = "👨‍👩‍👧"; // ZWJ emoji sequence

  test("a multi-codepoint emoji occupies a single column for slicing", () => {
    // "a" + emoji + "b": deleting column [1,2) removes the whole emoji, not a
    // stray code point that would corrupt the cluster.
    expect(deleteRange([`a${FAMILY}b`], { row: 0, col: 1 }, { row: 0, col: 2 })).toEqual(["ab"]);
    expect(extractSelection([`a${FAMILY}b`], { row: 0, col: 1 }, { row: 0, col: 2 })).toBe(FAMILY);
  });

  test("inserting an emoji advances the caret by one column", () => {
    const { caret } = insertAt([""], { row: 0, col: 0 }, FAMILY);
    expect(caret).toEqual({ row: 0, col: 1 });
  });
});
