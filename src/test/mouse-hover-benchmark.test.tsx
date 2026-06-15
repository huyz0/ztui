import { createElement } from "react";
import { describe, expect, test } from "vitest";
import { findDemo } from "../../examples/gallery/registry.ts";
import { runMouseHoverBenchmark } from "../tools/mouse-hover-benchmark.ts";

describe("runMouseHoverBenchmark", () => {
  test("coalesces a Ghostty-style hover sweep into a measurable benchmark report", async () => {
    const demo = findDemo("table");
    expect(demo).toBeTruthy();
    const result = await runMouseHoverBenchmark({
      ui: createElement(demo!.Component),
      cols: 100,
      rows: 30,
      sweep: {
        repeats: 8,
        path: [
          { x: 1, y: 1 },
          { x: 4, y: 1 },
          { x: 28, y: 1 },
          { x: 31, y: 1 },
          { x: 28, y: 1 },
          { x: 31, y: 1 },
        ],
        xStart: 1,
        xEnd: 31,
        y: 1,
      },
      settleMs: 80,
    });

    expect(result.totalEvents).toBeGreaterThan(40);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.renders).toBeGreaterThanOrEqual(0);
    expect(result.writes).toBeGreaterThanOrEqual(0);
    expect(result.capabilities.mouseHover).toBe(true);
    expect(result.pathSamples.length).toBeGreaterThan(10);
    expect(result.renderReasons).toBeTruthy();
  });

  test("supports sparse move streams for comparison baselines", async () => {
    const demo = findDemo("table");
    expect(demo).toBeTruthy();
    const sparse = await runMouseHoverBenchmark({
      ui: createElement(demo!.Component),
      cols: 100,
      rows: 30,
      sweep: { y: 8, xStart: 2, xEnd: 90, step: 8, repeats: 1 },
      settleMs: 40,
    });
    const dense = await runMouseHoverBenchmark({
      ui: createElement(demo!.Component),
      cols: 100,
      rows: 30,
      sweep: { y: 8, xStart: 2, xEnd: 90, step: 1, repeats: 1 },
      settleMs: 40,
    });

    expect(dense.totalEvents).toBeGreaterThan(sparse.totalEvents);
    expect(dense.pathSamples.length).toBeGreaterThan(sparse.pathSamples.length);
  });
});
