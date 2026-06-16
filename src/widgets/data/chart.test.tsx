import { describe, expect, test } from "vitest";
import { BarChart, LinePlot, VBox } from "../../react.ts";
import { mountApp } from "../../test/harness.tsx";

/** Count cells in [content] rows whose char is one of `chars`. */
function countIn(
  cellAt: (x: number, y: number) => { char: string },
  rect: { x: number; y: number; width: number; height: number },
  pred: (ch: string) => boolean,
): number {
  let n = 0;
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      if (pred(cellAt(x, y).char)) n++;
    }
  }
  return n;
}

const isBraille = (ch: string) =>
  ch.length > 0 && ch.charCodeAt(0) >= 0x2800 && ch.charCodeAt(0) <= 0x28ff;
const isBar = (ch: string) => ch === "█" || (ch >= "▏" && ch <= "▉");

describe("BarChart", () => {
  test("draws bars proportional to value", async () => {
    const { findById, cellAt, settle } = await mountApp(
      <VBox>
        <BarChart
          id="c"
          style={{ width: 30, height: 2 }}
          showValue={false}
          items={[
            { label: "a", value: 10 },
            { label: "b", value: 5 },
          ]}
        />
      </VBox>,
      { cols: 40, rows: 6 },
    );
    await settle();
    const r = findById("c").getClientRect();
    const row0 = countIn(cellAt, { x: r.x, y: r.y, width: r.width, height: 1 }, isBar);
    const row1 = countIn(cellAt, { x: r.x, y: r.y + 1, width: r.width, height: 1 }, isBar);
    expect(row0).toBeGreaterThan(row1); // value 10 bar longer than value 5
    expect(row1).toBeGreaterThan(0);
  });

  test("clips rows when height is shorter than the data", async () => {
    const { findById, settle } = await mountApp(
      <VBox>
        <BarChart
          id="c"
          style={{ width: 20, height: 2 }}
          items={[
            { label: "a", value: 1 },
            { label: "b", value: 2 },
            { label: "c", value: 3 },
            { label: "d", value: 4 },
          ]}
        />
      </VBox>,
      { cols: 30, rows: 8 },
    );
    await settle();
    expect(findById("c").getClientRect().height).toBe(2); // 4 items, only 2 rows
  });

  test("survives a tiny box and empty data without overflowing or throwing", async () => {
    const tiny = await mountApp(
      <VBox>
        <BarChart id="c" style={{ width: 1, height: 1 }} items={[{ label: "x", value: 5 }]} />
      </VBox>,
      { cols: 20, rows: 6 },
    );
    await tiny.settle();
    const r = tiny.findById("c").getClientRect();
    expect(r.width).toBe(1);
    // only the 1 content cell may carry a bar; nothing painted outside it
    const around = countIn(tiny.cellAt, { x: r.x, y: r.y, width: 3, height: 1 }, isBar);
    expect(around).toBeLessThanOrEqual(1);

    const empty = await mountApp(
      <VBox>
        <BarChart id="c" style={{ width: 20, height: 3 }} items={[]} />
      </VBox>,
      { cols: 30, rows: 6 },
    );
    await empty.settle();
    expect(empty.findById("c")).toBeTruthy(); // no throw
  });
});

describe("LinePlot", () => {
  test("renders braille cells for a series", async () => {
    const { findById, cellAt, settle } = await mountApp(
      <VBox>
        <LinePlot id="p" style={{ width: 20, height: 5 }} data={[1, 3, 2, 5, 4, 6, 3, 7]} />
      </VBox>,
      { cols: 30, rows: 8 },
    );
    await settle();
    const r = findById("p").getClientRect();
    expect(countIn(cellAt, r, isBraille)).toBeGreaterThan(0);
  });

  test("handles flat, single-point, and empty series without throwing", async () => {
    const flat = await mountApp(
      <VBox>
        <LinePlot id="p" style={{ width: 16, height: 4 }} data={[5, 5, 5, 5]} />
      </VBox>,
      { cols: 24, rows: 6 },
    );
    await flat.settle();
    expect(countIn(flat.cellAt, flat.findById("p").getClientRect(), isBraille)).toBeGreaterThan(0);

    const single = await mountApp(
      <VBox>
        <LinePlot id="p" style={{ width: 16, height: 4 }} data={[42]} />
      </VBox>,
      { cols: 24, rows: 6 },
    );
    await single.settle();
    expect(single.findById("p")).toBeTruthy();

    const empty = await mountApp(
      <VBox>
        <LinePlot id="p" style={{ width: 16, height: 4 }} data={[]} />
      </VBox>,
      { cols: 24, rows: 6 },
    );
    await empty.settle();
    expect(empty.findById("p")).toBeTruthy();
  });

  test("renders in a single 1×1 cell without overflowing", async () => {
    const { findById, cellAt, settle } = await mountApp(
      <VBox>
        <LinePlot id="p" style={{ width: 1, height: 1 }} data={[1, 5, 2, 8]} />
      </VBox>,
      { cols: 20, rows: 6 },
    );
    await settle();
    const r = findById("p").getClientRect();
    expect(r.width).toBe(1);
    expect(r.height).toBe(1);
    // the single content cell holds braille; neighbours stay empty
    expect(isBraille(cellAt(r.x, r.y).char)).toBe(true);
    expect(cellAt(r.x + 1, r.y).char.trim()).toBe("");
  });

  test("plots multiple series in distinct colours", async () => {
    const { findById, cellAt, settle } = await mountApp(
      <VBox>
        <LinePlot
          id="p"
          style={{ width: 20, height: 5 }}
          series={[
            [1, 2, 3, 4, 5],
            [5, 4, 3, 2, 1],
          ]}
          colors={["$accent", "$warning"]}
        />
      </VBox>,
      { cols: 30, rows: 8 },
    );
    await settle();
    const r = findById("p").getClientRect();
    const colors = new Set<string>();
    for (let y = r.y; y < r.y + r.height; y++) {
      for (let x = r.x; x < r.x + r.width; x++) {
        const c = cellAt(x, y);
        if (isBraille(c.char)) colors.add((c as { style: { color?: string } }).style.color ?? "");
      }
    }
    expect(colors.size).toBeGreaterThanOrEqual(2); // two series → two colours
  });
});
