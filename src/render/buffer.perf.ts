import { describe, expect, test } from "vitest";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { makeFilledBuffer, perfGuard, STYLE_SET } from "../test/bench/perf-harness.ts";
import { ScreenBuffer } from "./buffer.ts";
import { Segment } from "./segment.ts";

// Budgets are ≈3× a healthy local ratio (see perf-harness.ts) — generous enough
// to never flake on a slow CI runner, tight enough to catch an order-of-magnitude
// regression. Retune only when a deliberate change moves the baseline.
const W = 200;
const H = 50;

describe("perf: ScreenBuffer (render chokepoint)", () => {
  test("setCell fills a 200×50 frame", () => {
    const buf = new ScreenBuffer(W, H);
    perfGuard(
      "buffer.setCell ×10000",
      () => {
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) buf.setCell(x, y, "x", STYLE_SET[(x + y) % STYLE_SET.length]);
        }
      },
      { iterations: 200, budget: 260 },
    );
  });

  test("drawSegment lays runs across every row", () => {
    const buf = new ScreenBuffer(W, H);
    const seg = new Segment("the quick brown fox jumps over", STYLE_SET[2]);
    perfGuard(
      "buffer.drawSegment ×50",
      () => {
        for (let y = 0; y < H; y++) buf.drawSegment(0, y, seg);
      },
      { iterations: 1000, budget: 50 },
    );
  });

  test("renderDiff full repaint serializes a changed frame", () => {
    const next = makeFilledBuffer(W, H);
    const prev = new ScreenBuffer(W, H); // all-blank → every cell differs
    perfGuard(
      "buffer.renderDiff (full repaint)",
      () => {
        prev.clear();
        next.renderDiff(prev);
      },
      { iterations: 300, budget: 1800 },
    );
  });

  test("renderDiff of an unchanged frame is near-free and emits nothing", () => {
    const buf = makeFilledBuffer(W, H);
    const same = makeFilledBuffer(W, H);
    // Invariant (deterministic, no timing): an unchanged frame produces zero
    // output. If this ever returns non-empty, the diff is re-emitting unchanged
    // cells — a correctness *and* performance regression.
    expect(buf.renderDiff(same)).toBe("");
    perfGuard("buffer.renderDiff (no-op)", () => buf.renderDiff(same), {
      iterations: 500,
      budget: 150,
    });
  });

  test("renderDiff of a single changed row scans cheaply with a damage band", () => {
    const next = makeFilledBuffer(W, H);
    const prev = makeFilledBuffer(W, H);
    // One row differs; with yStart it only scans the damaged band.
    for (let x = 0; x < W; x++) next.cells[25][x].char = "Z";
    const out = next.renderDiff(prev, undefined, undefined, undefined, 25);
    // Invariant: output touches only the changed row (cursor move to row 26).
    expect(out).toContain("\x1b[26;");
    expect(out).not.toContain("\x1b[1;1H");
    perfGuard(
      "buffer.renderDiff (1-row damage)",
      () => next.renderDiff(prev, undefined, undefined, undefined, 25),
      { iterations: 2000, budget: 110 },
    );
  });

  test("clear blanks the grid", () => {
    const buf = makeFilledBuffer(W, H);
    perfGuard("buffer.clear", () => buf.clear(), { iterations: 1000, budget: 100 });
  });

  test("copyTo snapshots into a retained buffer", () => {
    const src = makeFilledBuffer(W, H);
    const dst = new ScreenBuffer(W, H);
    perfGuard("buffer.copyTo", () => src.copyTo(dst), { iterations: 1000, budget: 40 });
  });

  test("pushClip/popClip churn", () => {
    const buf = new ScreenBuffer(W, H);
    const region = new Region(new Offset(10, 10), new Size(50, 20));
    perfGuard(
      "buffer.pushClip+popClip",
      () => {
        buf.pushClip(region);
        buf.popClip();
      },
      { iterations: 5000, budget: 8 },
    );
  });
});
