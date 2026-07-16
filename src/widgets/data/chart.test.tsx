import { describe, expect, test } from "vitest";
import {
  AreaChartWidget,
  BarChartWidget,
  LinePlotWidget,
  PieChartWidget,
  ScatterPlotWidget,
} from "../../core.ts";
import { AreaChart, BarChart, LinePlot, PieChart, ScatterPlot, VBox } from "../../react.ts";
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

  test("measure() falls back to intrinsic size for a non-numeric width/height", async () => {
    const { findById, settle } = await mountApp(
      <VBox>
        <BarChart
          id="c"
          style={{ width: "1fr", height: "1fr" }}
          items={[{ label: "a", value: 1 }]}
        />
      </VBox>,
      { cols: 30, rows: 6 },
    );
    await settle();
    const w = findById("c") as unknown as { measuredWidth: number; measuredHeight: number };
    expect(w.measuredWidth).toBeGreaterThan(0);
    expect(w.measuredHeight).toBeGreaterThan(0);
  });

  test("items with no labels skip the label column entirely", async () => {
    const { findById, settle } = await mountApp(
      <VBox>
        <BarChart id="c" style={{ width: 20, height: 2 }} items={[{ value: 1 }, { value: 2 }]} />
      </VBox>,
      { cols: 30, rows: 6 },
    );
    await settle();
    expect(findById("c")).toBeTruthy(); // no throw; hasLabels is false
  });

  test("a non-finite value formats to an empty string instead of throwing", async () => {
    const { findById, text, settle } = await mountApp(
      <VBox>
        <BarChart
          id="c"
          style={{ width: 20, height: 1 }}
          items={[{ label: "n", value: Number.NaN }]}
        />
      </VBox>,
      { cols: 30, rows: 6 },
    );
    await settle();
    expect(findById("c")).toBeTruthy();
    expect(text()).not.toContain("NaN");
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

  test("measure() falls back to intrinsic size for a non-numeric width/height", async () => {
    const { findById, settle } = await mountApp(
      <VBox>
        <LinePlot id="p" style={{ width: "1fr", height: "1fr" }} data={[1, 2, 3]} />
      </VBox>,
      { cols: 30, rows: 8 },
    );
    await settle();
    const w = findById("p") as unknown as { measuredWidth: number; measuredHeight: number };
    expect(w.measuredWidth).toBeGreaterThan(0);
    expect(w.measuredHeight).toBeGreaterThan(0);
  });
});

describe("ScatterPlot", () => {
  test("plots points as braille dots and honours the x position", async () => {
    const { findById, cellAt, settle } = await mountApp(
      <VBox>
        <ScatterPlot
          id="s"
          style={{ width: 20, height: 5 }}
          points={[
            { x: 0, y: 0 },
            { x: 10, y: 10 },
          ]}
          minX={0}
          maxX={10}
          minY={0}
          maxY={10}
        />
      </VBox>,
      { cols: 30, rows: 8 },
    );
    await settle();
    const r = findById("s").getClientRect();
    // The two extremes land in opposite corners of the surface.
    expect(isBraille(cellAt(r.x, r.y + r.height - 1).char)).toBe(true); // (0,0) → bottom-left
    expect(isBraille(cellAt(r.x + r.width - 1, r.y).char)).toBe(true); // (10,10) → top-right
    expect(countIn(cellAt, r, isBraille)).toBe(2); // points only, no connecting line
  });

  test("auto-ranges and survives empty/single-point series", async () => {
    const single = await mountApp(
      <VBox>
        <ScatterPlot id="s" style={{ width: 12, height: 4 }} points={[{ x: 3, y: 7 }]} />
      </VBox>,
      { cols: 20, rows: 6 },
    );
    await single.settle();
    expect(countIn(single.cellAt, single.findById("s").getClientRect(), isBraille)).toBe(1);

    const empty = await mountApp(
      <VBox>
        <ScatterPlot id="s" style={{ width: 12, height: 4 }} points={[]} />
      </VBox>,
      { cols: 20, rows: 6 },
    );
    await empty.settle();
    expect(empty.findById("s")).toBeTruthy(); // no throw
  });

  test("measure() falls back to intrinsic size for a non-numeric width/height", async () => {
    const { findById, settle } = await mountApp(
      <VBox>
        <ScatterPlot id="s" style={{ width: "1fr", height: "1fr" }} points={[{ x: 1, y: 1 }]} />
      </VBox>,
      { cols: 20, rows: 6 },
    );
    await settle();
    const w = findById("s") as unknown as { measuredWidth: number; measuredHeight: number };
    expect(w.measuredWidth).toBeGreaterThan(0);
    expect(w.measuredHeight).toBeGreaterThan(0);
  });

  test("a flat x or y range (minX===maxX) plots without dividing by zero", async () => {
    const { findById, settle } = await mountApp(
      <VBox>
        <ScatterPlot
          id="s"
          style={{ width: 12, height: 4 }}
          points={[
            { x: 5, y: 1 },
            { x: 5, y: 9 },
          ]}
          minX={5}
          maxX={5}
        />
      </VBox>,
      { cols: 20, rows: 6 },
    );
    await settle();
    expect(findById("s")).toBeTruthy();
  });
});

describe("AreaChart", () => {
  test("fills the region below the line down to the baseline", async () => {
    const { findById, cellAt, settle } = await mountApp(
      <VBox>
        <AreaChart
          id="a"
          style={{ width: 20, height: 5 }}
          data={[2, 6, 4, 8, 5]}
          min={0}
          max={10}
        />
      </VBox>,
      { cols: 30, rows: 8 },
    );
    await settle();
    const r = findById("a").getClientRect();
    const filled = countIn(cellAt, r, isBraille);
    // A filled area lights far more cells than a bare line would in the same box.
    expect(filled).toBeGreaterThan(r.width);
    // The bottom row is part of the baseline fill across the whole width.
    const bottom = countIn(
      cellAt,
      { x: r.x, y: r.y + r.height - 1, width: r.width, height: 1 },
      isBraille,
    );
    expect(bottom).toBe(r.width);
  });

  test("handles empty data without throwing", async () => {
    const { findById, settle } = await mountApp(
      <VBox>
        <AreaChart id="a" style={{ width: 12, height: 4 }} data={[]} />
      </VBox>,
      { cols: 20, rows: 6 },
    );
    await settle();
    expect(findById("a")).toBeTruthy();
  });

  test("measure() falls back to intrinsic size for a non-numeric width/height", async () => {
    const { findById, settle } = await mountApp(
      <VBox>
        <AreaChart id="a" style={{ width: "1fr", height: "1fr" }} data={[1, 2, 3]} />
      </VBox>,
      { cols: 30, rows: 8 },
    );
    await settle();
    const w = findById("a") as unknown as { measuredWidth: number; measuredHeight: number };
    expect(w.measuredWidth).toBeGreaterThan(0);
    expect(w.measuredHeight).toBeGreaterThan(0);
  });
});

describe("PieChart", () => {
  test("draws a full-width stacked bar split into per-slice colours plus a legend", async () => {
    const { findById, cellAt, text, settle } = await mountApp(
      <VBox>
        <PieChart
          id="pie"
          style={{ width: 20 }}
          items={[
            { label: "used", value: 75, color: "$accent" },
            { label: "free", value: 25, color: "$success" },
          ]}
        />
      </VBox>,
      { cols: 30, rows: 8 },
    );
    await settle();
    const r = findById("pie").getClientRect();
    // Bar row spans the full width with block glyphs in (at least) two colours.
    const colors = new Set<string>();
    for (let x = r.x; x < r.x + r.width; x++) {
      const c = cellAt(x, r.y);
      expect(c.char).toBe("█");
      colors.add((c as { style: { color?: string } }).style.color ?? "");
    }
    expect(colors.size).toBe(2);
    // Legend rows carry the labels and rounded percentages.
    const out = text();
    expect(out).toContain("used");
    expect(out).toContain("75%");
    expect(out).toContain("25%");
  });

  test("legend can be hidden and zero/empty data is tolerated", async () => {
    const noLegend = await mountApp(
      <VBox>
        <PieChart id="pie" style={{ width: 16 }} showLegend={false} items={[{ value: 1 }]} />
      </VBox>,
      { cols: 24, rows: 6 },
    );
    await noLegend.settle();
    expect(noLegend.findById("pie").getClientRect().height).toBe(1); // bar only

    const empty = await mountApp(
      <VBox>
        <PieChart id="pie" style={{ width: 16 }} items={[]} />
      </VBox>,
      { cols: 24, rows: 6 },
    );
    await empty.settle();
    expect(empty.findById("pie")).toBeTruthy(); // no throw
  });
});

describe("chart widget classes are exported from the core entry", () => {
  test("all five chart widget classes are importable from ztui core", async () => {
    // Regression test: these widgets were registered (so <BarChart> etc.
    // worked) but their classes weren't re-exported from core.ts, unlike
    // every other widget — silently blocking direct import/instanceof use.
    const t = await mountApp(
      <VBox>
        <BarChart id="bar" items={[{ label: "a", value: 1 }]} />
        <LinePlot id="line" data={[1, 2, 3]} />
        <ScatterPlot id="scatter" points={[{ x: 1, y: 1 }]} />
        <AreaChart id="area" data={[1, 2, 3]} />
        <PieChart id="pie" items={[{ label: "a", value: 1 }]} />
      </VBox>,
    );
    await t.settle();
    expect(t.findById("bar")).toBeInstanceOf(BarChartWidget);
    expect(t.findById("line")).toBeInstanceOf(LinePlotWidget);
    expect(t.findById("scatter")).toBeInstanceOf(ScatterPlotWidget);
    expect(t.findById("area")).toBeInstanceOf(AreaChartWidget);
    expect(t.findById("pie")).toBeInstanceOf(PieChartWidget);
  });
});
