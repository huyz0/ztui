import { beforeEach, describe, expect, test } from "vitest";
import { FrameProfiler } from "./frame-profiler.ts";

describe("FrameProfiler", () => {
  let p: FrameProfiler;
  beforeEach(() => {
    p = new FrameProfiler();
  });

  test("is a no-op while disabled (zero cost, no accumulation)", () => {
    // now() returns a sentinel 0 and record/frame do nothing.
    expect(p.now()).toBe(0);
    p.record("render", p.now());
    p.frame({ full: true, emitted: true, bytes: 100 });
    const r = p.report();
    expect(r.frames).toBe(0);
    expect(r.totalMs).toBe(0);
    expect(r.bytes).toBe(0);
  });

  test("accumulates phase time and frame outcomes when enabled", () => {
    p.enabled = true;
    const start = p.now();
    // Burn a measurable slice so the phase total is > 0.
    while (p.now() - start < 1) {
      /* spin ~1ms */
    }
    p.record("render", start);
    p.frame({ full: true, emitted: true, bytes: 256 });
    p.frame({ full: false, emitted: false, bytes: 0 });

    const r = p.report();
    expect(r.frames).toBe(2);
    expect(r.fullFrames).toBe(1);
    expect(r.partialFrames).toBe(1);
    expect(r.emittedFrames).toBe(1);
    expect(r.redundantFrames).toBe(1);
    expect(r.redundantRate).toBe(0.5);
    expect(r.bytes).toBe(256);
    const render = r.phases.find((x) => x.phase === "render");
    expect(render?.totalMs).toBeGreaterThan(0);
    expect(render?.share).toBeCloseTo(1, 5); // render is the only timed phase
  });

  test("report lists all phases in pipeline order", () => {
    const order = p.report().phases.map((x) => x.phase);
    expect(order).toEqual(["restyle", "measure", "layout", "render", "diff", "write"]);
  });

  test("reset clears all counters", () => {
    p.enabled = true;
    p.record("diff", p.now());
    p.frame({ full: true, emitted: true, bytes: 10 });
    p.reset();
    const r = p.report();
    expect(r.frames).toBe(0);
    expect(r.bytes).toBe(0);
    expect(r.totalMs).toBe(0);
  });

  test("a phase can be recorded multiple times per frame (accumulates)", () => {
    p.enabled = true;
    p.record("restyle", p.now() - 2); // ~2ms
    p.record("restyle", p.now() - 3); // ~3ms
    const restyle = p.report().phases.find((x) => x.phase === "restyle");
    expect(restyle?.totalMs).toBeGreaterThan(3);
  });
});
