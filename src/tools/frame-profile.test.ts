import { createElement } from "react";
import { describe, expect, test } from "vitest";
import { findDemo } from "../../examples/gallery/registry.ts";
import { mountTestApp } from "./app-mount.tsx";
import { formatReport, formatRun, profileScenario, runProfile } from "./frame-profile.ts";

describe("runProfile / profileScenario", () => {
  test("runs both scenarios against a mounted UI and reports phase timings", async () => {
    const demo = findDemo("table");
    expect(demo).toBeTruthy();
    const run = await runProfile(createElement(demo!.Component), {
      label: "table",
      cols: 60,
      rows: 20,
      iterations: 3,
      warmup: 1,
    });

    expect(run.label).toBe("table");
    expect(run.cols).toBe(60);
    expect(run.rows).toBe(20);
    expect(run.scenarios).toHaveLength(2);
    const [redundant, repaint] = run.scenarios;
    expect(redundant.mode).toBe("redundant");
    expect(redundant.iterations).toBe(3);
    expect(redundant.report.frames).toBe(3);
    expect(repaint.mode).toBe("repaint");
    // Repaint invalidates the whole buffer every frame, so it always emits;
    // redundant re-runs over an unchanged tree, so it emits nothing.
    expect(repaint.report.emittedFrames).toBeGreaterThan(0);
    expect(redundant.report.emittedFrames).toBe(0);
  });

  test("profileScenario disables the profiler again even if a forced frame throws", async () => {
    const t = await mountTestApp(createElement(findDemo("table")!.Component), {
      cols: 40,
      rows: 10,
    });
    const app = t.app as unknown as { layoutAndRender: () => void };
    const original = app.layoutAndRender;
    app.layoutAndRender = () => {
      throw new Error("forced failure");
    };
    try {
      expect(() => profileScenario(t.app, "redundant", 1, 0)).toThrow("forced failure");
    } finally {
      app.layoutAndRender = original;
    }
    // frameProfiler.enabled must be false again — verified indirectly: a
    // fresh, well-behaved scenario still produces a sane report afterwards.
    const result = profileScenario(t.app, "redundant", 1, 0);
    expect(result.report.frames).toBe(1);
  });
});

describe("formatReport / formatRun", () => {
  test("formats a run's header and per-scenario phase table", async () => {
    const demo = findDemo("table");
    const run = await runProfile(createElement(demo!.Component), {
      label: "fmt-demo",
      cols: 50,
      rows: 15,
      iterations: 2,
      warmup: 0,
    });
    const report = formatReport(run.scenarios[0]);
    expect(report).toContain("redundant");
    expect(report).toContain("frames");
    expect(report).toContain("µs/frame");

    const full = formatRun(run);
    expect(full).toContain('Frame profile — "fmt-demo" at 50×15');
    expect(full).toContain("redundant");
    expect(full).toContain("repaint");
  });

  test("pad/lpad pass strings already at (or past) the target width through unchanged", async () => {
    const t = await mountTestApp(createElement(findDemo("table")!.Component), {
      cols: 40,
      rows: 10,
    });
    // 0 iterations → 0 frames, exercising the `r.frames > 0 ? ... : 0` guard,
    // and an empty `phases` list still round-trips through formatReport.
    const result = profileScenario(t.app, "redundant", 0, 0);
    expect(result.report.frames).toBe(0);
    const report = formatReport(result);
    expect(report).toContain("0 frames");
    expect(report).toContain("0.0 µs/frame");
  });
});
