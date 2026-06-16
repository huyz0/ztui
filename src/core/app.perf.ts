import { createElement } from "react";
import { describe, expect, test } from "vitest";
import { findDemo } from "../../examples/gallery/registry.ts";
import { perfGuard } from "../test/bench/perf-harness.ts";
import { mountApp } from "../test/harness.tsx";
import type { App } from "./app.ts";

// The end-to-end frame: style resolution → measure → layout → render → diff →
// serialize. This is what actually runs on every `queueRender`, so it's the
// headline number — a regression anywhere in the pipeline shows up here.

/** Force one synchronous full frame (bypassing the async render scheduler). */
function forceFullFrame(app: App): void {
  const a = app as unknown as {
    needsLayout: boolean;
    repaintFull: boolean;
    layoutAndRender: () => void;
  };
  a.needsLayout = true;
  a.repaintFull = true;
  a.layoutAndRender();
}

describe("perf: full render frame (app.ts)", () => {
  test("forced full frame on a representative dashboard demo", async () => {
    const demo = findDemo("rich");
    expect(demo).toBeTruthy();
    const t = await mountApp(createElement(demo!.Component), { cols: 120, rows: 40 });
    await t.settle();
    // Sanity: the demo actually painted something.
    expect(t.text().trim().length).toBeGreaterThan(0);
    perfGuard("app.full frame (rich demo, 120×40)", () => forceFullFrame(t.app), {
      iterations: 60,
      warmup: 20,
      budget: 900,
    });
  });
});
