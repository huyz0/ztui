import { describe, expect, test } from "vitest";
import { fitCell } from "./cell-format.ts";

describe("fitCell", () => {
  test("pads short text to the exact width per alignment", () => {
    expect(fitCell("hi", 5, "left")).toBe("hi   ");
    expect(fitCell("hi", 5, "right")).toBe("   hi");
    expect(fitCell("hi", 5, "center")).toBe(" hi  ");
  });

  test("truncates long text with an ellipsis at the exact width", () => {
    expect(fitCell("Christopher", 5)).toBe("Chri…");
    expect(fitCell("Christopher", 5).length).toBe(5);
  });

  test("returns empty for non-positive width", () => {
    expect(fitCell("x", 0)).toBe("");
  });

  test("collapses to a single ellipsis at width 1", () => {
    expect(fitCell("long", 1)).toBe("…");
  });
});
