import { describe, expect, test } from "vitest";
import { DescriptionList, VBox } from "../../react.ts";
import { mountApp } from "../../test/harness.tsx";

/** Read one content row as a trimmed string. */
function rowText(
  cellAt: (x: number, y: number) => { char: string },
  rect: { x: number; y: number; width: number },
  y: number,
): string {
  let s = "";
  for (let x = rect.x; x < rect.x + rect.width; x++) s += cellAt(x, y).char;
  return s;
}

describe("DescriptionList", () => {
  test("aligns terms and descriptions in two columns", async () => {
    const { findById, cellAt, settle } = await mountApp(
      <VBox>
        <DescriptionList
          id="dl"
          items={[
            { term: "Model", description: "opus" },
            { term: "Context", description: "200k" },
          ]}
        />
      </VBox>,
      { cols: 40, rows: 6 },
    );
    await settle();
    const r = findById("dl").getClientRect();
    const row0 = rowText(cellAt, r, r.y);
    const row1 = rowText(cellAt, r, r.y + 1);
    expect(row0).toContain("Model");
    expect(row0).toContain("opus");
    expect(row1).toContain("Context");
    // Both descriptions start at the same column (term column auto-sized to
    // "Context" = 7, gap 2 → x=9).
    expect(row0.indexOf("opus")).toBe(row1.indexOf("200k"));
    expect(row0.indexOf("opus")).toBe(9);
  });

  test("wraps a long description under the description column", async () => {
    const { findById, cellAt, settle } = await mountApp(
      <VBox>
        <DescriptionList
          id="dl"
          style={{ width: 24 }}
          items={[{ term: "Note", description: "this description is long enough to wrap" }]}
        />
      </VBox>,
      { cols: 40, rows: 8 },
    );
    await settle();
    const r = findById("dl").getClientRect();
    expect(r.height).toBeGreaterThan(1); // wrapped onto multiple rows
    // The term appears only on the first row; continuation rows are description-only.
    expect(rowText(cellAt, r, r.y)).toContain("Note");
    expect(rowText(cellAt, r, r.y + 1)).not.toContain("Note");
  });

  test("right-aligns terms and respects a fixed term width", async () => {
    const { findById, cellAt, settle } = await mountApp(
      <VBox>
        <DescriptionList
          id="dl"
          termWidth={8}
          termAlign="right"
          items={[{ term: "id", description: "42" }]}
        />
      </VBox>,
      { cols: 30, rows: 4 },
    );
    await settle();
    const r = findById("dl").getClientRect();
    const row = rowText(cellAt, r, r.y);
    // term "id" right-aligned within an 8-wide column → ends at col 7.
    expect(row.indexOf("id")).toBe(6);
    expect(row.indexOf("42")).toBe(10); // 8 + gap(2)
  });

  test("survives a tiny box and empty items without overflowing", async () => {
    const tiny = await mountApp(
      <VBox>
        <DescriptionList
          id="dl"
          style={{ width: 3 }}
          items={[{ term: "key", description: "value" }]}
        />
      </VBox>,
      { cols: 20, rows: 6 },
    );
    await tiny.settle();
    const r = tiny.findById("dl").getClientRect();
    expect(r.width).toBe(3);
    for (let y = r.y; y < r.y + r.height; y++) {
      expect(tiny.cellAt(r.x + r.width, y).char.trim()).toBe("");
    }

    const empty = await mountApp(
      <VBox>
        <DescriptionList id="dl" style={{ width: 20 }} items={[]} />
      </VBox>,
      { cols: 30, rows: 4 },
    );
    await empty.settle();
    expect(empty.findById("dl")).toBeTruthy(); // no throw
  });
});
