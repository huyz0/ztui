import { describe, expect, test } from "vitest";
import { Segment } from "../segment.ts";
import { sliceToWidth, wrapSegmentLine } from "./wrap.ts";

describe("sliceToWidth", () => {
  test("returns empty string for empty input", () => {
    expect(sliceToWidth("", 5)).toBe("");
  });
});

describe("wrapSegmentLine", () => {
  test("handles an empty-text segment without crashing", () => {
    const lines = wrapSegmentLine([new Segment("")], 5);
    expect(lines).toEqual([[]]);
  });

  test("drops a leading run of spaces that overflows an empty current line", () => {
    // A run of spaces wider than the width, appearing before any other content,
    // hits the overflow branch while `cur` is still empty.
    const lines = wrapSegmentLine([new Segment("     ")], 3);
    expect(lines.flat().map((s) => s.text)).toEqual([]);
  });

  test("hard-splits a word that is an exact multiple of the width", () => {
    const lines = wrapSegmentLine([new Segment("abcdef")], 3);
    expect(lines.map((l) => l.map((s) => s.text))).toEqual([["abc"], ["def"]]);
  });
});
