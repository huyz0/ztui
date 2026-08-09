import { describe, expect, test } from "vitest";
import { cellOverflows, fitCell } from "./cell-format.ts";

describe("fitCell", () => {
  test("pads short text to the exact width per alignment", () => {
    expect(fitCell("hi", 5, "left")).toBe("hi   ");
    expect(fitCell("hi", 5, "right")).toBe("   hi");
    expect(fitCell("hi", 5, "center")).toBe(" hi  ");
  });

  test("clips long text to the exact width without an ellipsis", () => {
    expect(fitCell("Christopher", 5)).toBe("Chris");
    expect(fitCell("Christopher", 5).length).toBe(5);
  });

  test("returns empty for non-positive width", () => {
    expect(fitCell("x", 0)).toBe("");
  });

  test("collapses to a space at width 1 when text overflows", () => {
    // Width 1: a wide char doesn't fit, nothing is added, pad fills with space.
    expect(fitCell("long", 1)).toBe("l");
  });

  test("pads when a wide char forces an early break leaving a gap", () => {
    // "aa" (2) + "漢" (2) = 4 fits exactly — no x is added, no padding needed.
    expect(fitCell("aa漢x", 4)).toBe("aa漢");
    // "a" (1) + "漢" (2) = 3 < 4, but adding another "漢" (2) would overflow →
    // we stop and pad the leftover column.
    expect(fitCell("a漢漢", 4)).toBe("a漢 ");
  });
});

describe("cellOverflows", () => {
  test("returns true when text is wider than the cell", () => {
    expect(cellOverflows("Christopher", 5)).toBe(true);
  });

  test("returns false when text fits exactly", () => {
    expect(cellOverflows("hello", 5)).toBe(false);
  });

  test("returns false when text is shorter than the cell", () => {
    expect(cellOverflows("hi", 5)).toBe(false);
  });
});
