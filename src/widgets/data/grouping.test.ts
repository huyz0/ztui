import { describe, expect, test } from "vitest";
import {
  buildGroupedRows,
  type GroupedRow,
  initialCollapsed,
  type RowGroup,
  seekItemRow,
} from "./grouping.ts";

const groups: RowGroup<string>[] = [
  { id: "a", title: "Group A", items: ["a1", "a2"] },
  { id: "b", title: "Group B", items: ["b1"], collapsed: true },
  { id: "c", title: "Group C", items: ["c1", "c2", "c3"] },
];

describe("initialCollapsed", () => {
  test("seeds from each group's collapsed flag", () => {
    expect([...initialCollapsed(groups)]).toEqual(["b"]);
    expect(initialCollapsed([{ id: "x", title: "X", items: [] }]).size).toBe(0);
  });
});

describe("buildGroupedRows", () => {
  test("emits a header per group and items only when expanded", () => {
    const rows = buildGroupedRows(groups, initialCollapsed(groups));
    const shape = rows.map((r) => (r.kind === "header" ? `H:${r.id}` : `I:${r.item}`));
    // Group B is collapsed, so its item is hidden.
    expect(shape).toEqual(["H:a", "I:a1", "I:a2", "H:b", "H:c", "I:c1", "I:c2", "I:c3"]);
  });

  test("header carries collapsed state and item count", () => {
    const rows = buildGroupedRows(groups, initialCollapsed(groups));
    const headers = rows.filter(
      (r): r is Extract<GroupedRow<string>, { kind: "header" }> => r.kind === "header",
    );
    expect(headers.map((h) => [h.id, h.collapsed, h.count])).toEqual([
      ["a", false, 2],
      ["b", true, 1],
      ["c", false, 3],
    ]);
  });

  test("empty collapse set expands everything", () => {
    const rows = buildGroupedRows(groups, new Set());
    expect(rows.filter((r) => r.kind === "item")).toHaveLength(6);
  });

  test("item rows carry their group and item index", () => {
    const rows = buildGroupedRows([groups[2]], new Set());
    expect(rows[2]).toMatchObject({ kind: "item", groupIndex: 0, itemIndex: 1, item: "c2" });
  });
});

describe("seekItemRow", () => {
  const rows = buildGroupedRows(groups, new Set());
  // index: 0 H:a, 1 a1, 2 a2, 3 H:b, 4 b1, 5 H:c, 6 c1, 7 c2, 8 c3

  test("skips headers going down", () => {
    expect(seekItemRow(rows, 3, 1)).toBe(4); // header b -> b1
    expect(seekItemRow(rows, 0, 1)).toBe(1); // header a -> a1
  });

  test("skips headers going up", () => {
    expect(seekItemRow(rows, 5, -1)).toBe(4); // header c -> b1
    expect(seekItemRow(rows, 3, -1)).toBe(2); // header b -> a2
  });

  test("lands in place when already on an item", () => {
    expect(seekItemRow(rows, 7, 1)).toBe(7);
    expect(seekItemRow(rows, 7, -1)).toBe(7);
  });

  test("returns -1 when no item lies in that direction", () => {
    expect(seekItemRow(rows, 8, 1)).toBe(8); // last item itself
    expect(
      seekItemRow(
        [{ kind: "header", groupIndex: 0, id: "a", title: "A", collapsed: false, count: 0 }],
        0,
        1,
      ),
    ).toBe(-1);
    expect(seekItemRow(rows, -1, -1)).toBe(-1);
  });
});
