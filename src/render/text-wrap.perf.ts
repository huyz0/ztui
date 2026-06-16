import { describe, test } from "vitest";
import { perfGuard } from "../test/bench/perf-harness.ts";
import { truncate, wrapText } from "./text-wrap.ts";

// Word-wrap and truncation run for every paragraph/label/cell on a relayout.
const PARAGRAPH =
  "ztui re-renders a full widget tree to a cell buffer and diffs it to ANSI on " +
  "every frame, so a small algorithmic regression in the render or layout core " +
  "can silently tank interactive performance across a busy terminal session. " +
  "This sentence is intentionally long, with several clauses, so the greedy " +
  "wrapper has real word boundaries and a long-token break path to exercise.";

describe("perf: text wrapping (text-wrap.ts)", () => {
  test("wrapText at width 40", () => {
    perfGuard("text-wrap.wrapText (w=40)", () => wrapText(PARAGRAPH, 40), {
      iterations: 2000,
      budget: 6,
    });
  });

  test("wrapText at a narrow width forces more breaks", () => {
    perfGuard("text-wrap.wrapText (w=12)", () => wrapText(PARAGRAPH, 12), {
      iterations: 2000,
      budget: 7,
    });
  });

  test("truncate to a fixed width", () => {
    perfGuard("text-wrap.truncate", () => truncate(PARAGRAPH, 40), {
      iterations: 5000,
      budget: 3,
    });
  });
});
