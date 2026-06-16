import { createElement } from "react";
import { describe, expect, test } from "vitest";
import type { App } from "../core/app.ts";
import { HBox, VBox, View } from "../react.ts";
import { perfGuard } from "../test/bench/perf-harness.ts";
import { mountApp } from "../test/harness.tsx";

// Layout solving traverses the whole widget tree to assign every region. These
// fixtures build deep/wide nested boxes and grids so the forced frame is
// dominated by the box/grid layout passes rather than by painting.

function forceLayoutFrame(app: App): void {
  const a = app as unknown as {
    needsLayout: boolean;
    repaintFull: boolean;
    layoutAndRender: () => void;
  };
  a.needsLayout = true;
  a.repaintFull = true;
  a.layoutAndRender();
}

/** A nested ladder of alternating V/H boxes `depth` deep, each holding `breadth` views. */
function nestedBoxes(depth: number, breadth: number): React.ReactElement {
  let node: React.ReactElement = createElement(View, { style: { width: 4, height: 1 } }, "leaf");
  for (let d = 0; d < depth; d++) {
    const Box = d % 2 === 0 ? VBox : HBox;
    const siblings = Array.from({ length: breadth }, (_, i) =>
      createElement(View, { key: `s${d}-${i}`, style: { width: 6, height: 1 } }, "·"),
    );
    node = createElement(Box, { key: `d${d}`, style: { flexGrow: 1 } }, node, ...siblings);
  }
  return node;
}

describe("perf: layout solving (box/grid)", () => {
  test("forced frame on a deeply nested flex tree", async () => {
    const t = await mountApp(nestedBoxes(20, 4), { cols: 120, rows: 40 });
    await t.settle();
    expect(t.app.activeScreen).toBeTruthy();
    perfGuard("layout.nested flex (depth 20 ×4)", () => forceLayoutFrame(t.app), {
      iterations: 100,
      warmup: 30,
      budget: 850,
    });
  });

  test("forced frame on a grid of many cells", async () => {
    const cells = Array.from({ length: 120 }, (_, i) =>
      createElement(View, { key: `g${i}`, style: { height: 1 } }, String(i % 10)),
    );
    const grid = createElement(VBox, { style: { display: "grid", flexGrow: 1 } }, ...cells);
    const t = await mountApp(grid, { cols: 120, rows: 40 });
    await t.settle();
    perfGuard("layout.grid (120 cells)", () => forceLayoutFrame(t.app), {
      iterations: 100,
      warmup: 30,
      budget: 450,
    });
  });
});
