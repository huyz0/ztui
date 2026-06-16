import { bench, describe } from "vitest";
import { makeFilledBuffer, STYLE_SET } from "../test/bench/perf-harness.ts";
import { ScreenBuffer } from "./buffer.ts";
import { Segment } from "./segment.ts";

// Ops/sec tracking for the render chokepoint. Not asserted — run `bun run bench`
// to watch for gradual drift; the hard regression gate is buffer.perf.ts.
const W = 200;
const H = 50;

describe("bench: ScreenBuffer", () => {
  const buf = new ScreenBuffer(W, H);
  bench("setCell ×10000", () => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) buf.setCell(x, y, "x", STYLE_SET[(x + y) % STYLE_SET.length]);
    }
  });

  const seg = new Segment("the quick brown fox jumps over", STYLE_SET[2]);
  bench("drawSegment ×50", () => {
    for (let y = 0; y < H; y++) buf.drawSegment(0, y, seg);
  });

  const next = makeFilledBuffer(W, H);
  const prev = new ScreenBuffer(W, H);
  bench("renderDiff full repaint", () => {
    prev.clear();
    next.renderDiff(prev);
  });

  const same = makeFilledBuffer(W, H);
  const unchanged = makeFilledBuffer(W, H);
  bench("renderDiff no-op", () => {
    unchanged.renderDiff(same);
  });
});
