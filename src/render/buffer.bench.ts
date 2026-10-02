import { describe, test } from "vitest";
import { makeFilledBuffer, STYLE_SET } from "../test/bench/perf-harness.ts";
import { ScreenBuffer } from "./buffer.ts";
import { Segment } from "./segment.ts";

// Ops/sec tracking for the render chokepoint. Not asserted — run `bun run bench`
// to watch for gradual drift; the hard regression gate is buffer.perf.ts.
const W = 200;
// Bind locally: under Vite's module runner an imported binding is a getter,
// which would add overhead inside the hot setCell loop.
const STYLES = STYLE_SET;
const H = 50;

describe("bench: ScreenBuffer", () => {
  test("setCell ×10000", async ({ bench }) => {
    const buf = new ScreenBuffer(W, H);
    await bench("setCell ×10000", () => {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) buf.setCell(x, y, "x", STYLES[(x + y) % STYLES.length]);
      }
    }).run();
  });

  test("drawSegment ×50", async ({ bench }) => {
    const buf = new ScreenBuffer(W, H);
    const seg = new Segment("the quick brown fox jumps over", STYLES[2]);
    await bench("drawSegment ×50", () => {
      for (let y = 0; y < H; y++) buf.drawSegment(0, y, seg);
    }).run();
  });

  test("renderDiff full repaint", async ({ bench }) => {
    const next = makeFilledBuffer(W, H);
    const prev = new ScreenBuffer(W, H);
    await bench("renderDiff full repaint", () => {
      prev.clear();
      next.renderDiff(prev);
    }).run();
  });

  test("renderDiff no-op", async ({ bench }) => {
    const same = makeFilledBuffer(W, H);
    const unchanged = makeFilledBuffer(W, H);
    await bench("renderDiff no-op", () => {
      unchanged.renderDiff(same);
    }).run();
  });
});
