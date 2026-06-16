import { describe, expect, test } from "vitest";
import { Widget } from "../dom/widget.ts";
import { perfGuard } from "../test/bench/perf-harness.ts";
import { ReadonlySelectionManager, runCols } from "./selection.ts";

// During a mouse-drag selection, every move runs `pointFromScreen` over all the
// runs registered that frame (O(runs)), and each selectable widget rebuilds its
// `runCols` on every render — the per-event hot path of read-only selection.
const LINE = "the quick brown fox jumps over the lazy dog ".repeat(3);

describe("perf: read-only selection (selection.ts)", () => {
  test("runCols maps a long line to logical columns", () => {
    perfGuard("selection.runCols (long line)", () => runCols(LINE), {
      iterations: 5000,
      budget: 4,
    });
  });

  test("pointFromScreen scans a frame full of runs", () => {
    const mgr = new ReadonlySelectionManager();
    const widget = new Widget("label");
    mgr.beginFrame();
    const cols = runCols(LINE);
    // 200 rows of runs — a long scrolling log view's worth of selectable content.
    for (let y = 0; y < 200; y++) {
      mgr.addRun({ widget, line: y, y, x: 0, cols });
    }
    // Invariant: an exact hit resolves to that run's logical position.
    expect(mgr.pointFromScreen(5, 10)).toEqual({ widget, line: 10, col: 5 });
    perfGuard("selection.pointFromScreen (200 runs)", () => mgr.pointFromScreen(133, 150), {
      iterations: 2000,
      budget: 2,
    });
  });
});
