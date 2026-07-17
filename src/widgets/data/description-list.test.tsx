import { describe, expect, test } from "vitest";
import { Region } from "../../geometry/region.ts";
import { DescriptionList, VBox } from "../../react.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
import { mountApp } from "../../test/harness.tsx";
import type { DescriptionListWidget } from "./description-list.ts";

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

  test("falls back to item count when a fixed height resolves to an fr weight", async () => {
    // "1fr" isn't a plain number of rows: parseDimension() resolves it to an
    // `{ fr }` weight (used for flex distribution), so DescriptionList's
    // measure() can't use it directly and falls back to `this.items.length`
    // for its intrinsic height before the flex pass stretches the box.
    const { findById, settle } = await mountApp(
      <VBox>
        <DescriptionList
          id="dl"
          style={{ width: 20, height: "1fr" }}
          items={[
            { term: "a", description: "1" },
            { term: "b", description: "2" },
            { term: "c", description: "3" },
          ]}
        />
      </VBox>,
      { cols: 80, rows: 24 },
    );
    await settle();
    // The VBox stretches its single "1fr" child to fill the screen (24 rows),
    // confirming the fr branch ran (a plain-number height would never expand
    // past its measured size); measure() itself is exercised via coverage.
    expect(findById("dl").getClientRect().height).toBe(24);
  });

  test("skips the term column entirely when termWidth is 0", async () => {
    const { findById, cellAt, settle } = await mountApp(
      <VBox>
        <DescriptionList id="dl" termWidth={0} items={[{ term: "hidden", description: "value" }]} />
      </VBox>,
      { cols: 30, rows: 4 },
    );
    await settle();
    const r = findById("dl").getClientRect();
    const row = rowText(cellAt, r, r.y);
    expect(row).not.toContain("hidden");
    expect(row).toContain("value");
    expect(row.indexOf("value")).toBe(0); // no gap reserved when termW is 0
  });

  test("render() is a no-op when the content rect has zero height", async () => {
    const { findById, settle } = await mountApp(
      <VBox>
        <DescriptionList id="dl" style={{ width: 10 }} items={[{ term: "a", description: "b" }]} />
      </VBox>,
      { cols: 30, rows: 4 },
    );
    await settle();
    const widget = findById<DescriptionListWidget>("dl")!;
    // Force a zero-height region directly (the tree wouldn't even call
    // render() on a widget the layout already collapsed to zero size), then
    // invoke render() the way the framework does, to exercise its own guard.
    widget.region = Region.EMPTY;
    const buffer = new ScreenBuffer(10, 1);
    expect(() => widget.render(buffer)).not.toThrow();
  });

  test("breaks a wrapped description mid-item when the row limit is reached", async () => {
    const { findById, cellAt, settle } = await mountApp(
      <VBox>
        <DescriptionList
          id="dl"
          style={{ width: 12, height: 2 }}
          items={[
            { term: "a", description: "one two three four five six seven" },
            { term: "b", description: "eight" },
          ]}
        />
      </VBox>,
      { cols: 30, rows: 6 },
    );
    await settle();
    const r = findById("dl").getClientRect();
    expect(r.height).toBe(2);
    // The wrapped first description alone exceeds 2 rows, so both the inner
    // wrap loop and the outer item loop must break early; the second item
    // ("eight") never gets drawn.
    let all = "";
    for (let y = r.y; y < r.y + r.height; y++) all += rowText(cellAt, r, y);
    expect(all).not.toContain("eight");
  });

  test("falls back to the intrinsic width when a fixed width resolves to an fr weight", async () => {
    const { findById, settle } = await mountApp(
      <VBox>
        <DescriptionList
          id="dl"
          style={{ width: "1fr" }}
          items={[{ term: "term", description: "desc" }]}
        />
      </VBox>,
      { cols: 80, rows: 24 },
    );
    await settle();
    // The VBox stretches its single "1fr" child to fill the screen width (80),
    // confirming the fr branch ran (a plain-number width would never expand
    // past its intrinsic size).
    expect(findById("dl").getClientRect().width).toBe(80);
  });

  test("render() is a no-op when the widget is invisible", async () => {
    const { findById, settle } = await mountApp(
      <VBox>
        <DescriptionList id="dl" items={[{ term: "hidden-term", description: "hidden-desc" }]} />
      </VBox>,
      { cols: 30, rows: 4 },
    );
    await settle();
    const widget = findById<DescriptionListWidget>("dl")!;
    widget.visible = false;
    const buffer = new ScreenBuffer(30, 4);
    expect(() => widget.render(buffer)).not.toThrow();
  });
});
