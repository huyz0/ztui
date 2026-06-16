import { describe, expect, test } from "vitest";
import { truncate, wrapText } from "./text-wrap.ts";

describe("wrapText", () => {
  test("greedily wraps on word boundaries and drops the wrap-point space", () => {
    expect(wrapText("the quick brown fox", 9)).toEqual(["the quick", "brown fox"]);
  });

  test("honours hard newlines, including blank lines", () => {
    expect(wrapText("a\n\nb", 10)).toEqual(["a", "", "b"]);
  });

  test("hard-breaks a single word longer than the width", () => {
    expect(wrapText("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });

  test("returns [] for a non-positive width", () => {
    expect(wrapText("anything", 0)).toEqual([]);
  });
});

describe("truncate", () => {
  test("returns the text unchanged when it fits", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  test("adds an ellipsis when it overflows", () => {
    expect(truncate("hello world", 8)).toBe("hello w…");
  });

  test("a width of 1 is just the ellipsis; 0 is empty", () => {
    expect(truncate("hello", 1)).toBe("…");
    expect(truncate("hello", 0)).toBe("");
  });
});
