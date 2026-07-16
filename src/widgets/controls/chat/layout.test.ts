import { describe, expect, test } from "vitest";
import { caretRowCol, indexAtRowCol, layoutRows } from "./layout.ts";

describe("layoutRows", () => {
  test("wraps atoms onto a new row once the inner width is exceeded", () => {
    const rows = layoutRows([..."hello world"], 5, true);
    expect(rows.map((r) => r.atoms.map((a) => a.atom).join(""))).toEqual(["hello", " worl", "d"]);
  });

  test("splits on explicit newlines regardless of width", () => {
    const rows = layoutRows([..."ab\ncd"], 10, true);
    expect(rows.map((r) => r.atoms.map((a) => a.atom).join(""))).toEqual(["ab", "cd"]);
  });

  test("does not wrap when softWrap is false", () => {
    const rows = layoutRows([..."hello world"], 5, false);
    expect(rows.length).toBe(1);
  });
});

describe("caretRowCol / indexAtRowCol", () => {
  test("round-trips a caret index through row/col and back", () => {
    const atoms = [..."hello world"];
    const rows = layoutRows(atoms, 5, true);
    const here = caretRowCol(rows, 7); // 'w' at index 7, on row 1 (" worl")
    expect(here.row).toBe(1);
    const idx = indexAtRowCol(rows, here.row, here.col);
    expect(idx).toBe(7);
  });
});
