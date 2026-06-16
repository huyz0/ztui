import { expect } from "vitest";
import { ScreenBuffer } from "../../render/buffer.ts";
import { Style } from "../../render/style.ts";

/**
 * Micro-benchmark harness for ztui's render/layout hot paths.
 *
 * The problem with wall-clock budgets is that shared CI runners vary in speed by
 * an order of magnitude, so an absolute "must finish in N ms" assertion either
 * flakes on a slow runner or fails to catch a regression on a fast one. Instead
 * every guard is expressed as a **ratio** against a fixed calibration workload
 * measured in the same process: `ratio = nsPerOp(hotPath) / nsPerOp(reference)`.
 * Both are pure JS and scale together with CPU speed, so the ratio is stable
 * across machines and a regression shows up as the ratio blowing past its budget.
 *
 * Budgets are set generously (≈3× a healthy run) so this only fires on real,
 * order-of-magnitude regressions — never on normal noise. The raw ns/op numbers
 * are logged for humans; the sibling `*.bench.ts` files give ops/sec tracking.
 */

export interface MeasureOptions {
  /** Inner-loop reps per sample. */
  iterations?: number;
  /** Untimed reps before measuring, to let the JIT warm up. */
  warmup?: number;
  /** Timed samples; the median is returned to shrug off scheduler jitter. */
  samples?: number;
}

/** Keep results observable so the optimizer can't elide the measured work. */
let sink = 0;
/** Consume a value so a benchmarked pure function isn't dead-code-eliminated. */
export function blackhole(value: unknown): void {
  // Cheap, side-effecting, and dependent on the input.
  sink = (sink + (typeof value === "number" ? value : 1)) | 0;
}

/** Median nanoseconds per op for `fn`, after warmup. */
export function measureNsPerOp(fn: () => void, opts: MeasureOptions = {}): number {
  const iterations = opts.iterations ?? 1000;
  const warmup = opts.warmup ?? Math.min(iterations, 256);
  const samples = opts.samples ?? 7;

  for (let i = 0; i < warmup; i++) fn();

  const perOp: number[] = [];
  for (let s = 0; s < samples; s++) {
    const t0 = performance.now();
    for (let i = 0; i < iterations; i++) fn();
    const elapsedMs = performance.now() - t0;
    perOp.push((elapsedMs * 1e6) / iterations); // ms → ns, per op
  }
  perOp.sort((a, b) => a - b);
  return perOp[perOp.length >> 1];
}

/**
 * A fixed unit of "machine work" — deterministic arithmetic + array traversal,
 * sized to land in the same ballpark as the smaller hot paths. Measured once per
 * process; the result is the denominator for every ratio guard.
 */
function referenceWorkload(): number {
  let acc = 0;
  const arr = new Array<number>(256);
  for (let i = 0; i < 256; i++) arr[i] = (i * 2654435761) >>> 0;
  for (let i = 0; i < 256; i++) acc = (acc + arr[i]) % 1_000_003;
  return acc;
}

let calibrationNs: number | null = null;
/** Median ns/op of the reference workload (cached for the process). */
export function calibrate(): number {
  if (calibrationNs === null) {
    calibrationNs = measureNsPerOp(() => blackhole(referenceWorkload()), {
      iterations: 2000,
      samples: 9,
    });
  }
  return calibrationNs;
}

export interface GuardOptions extends MeasureOptions {
  /** Max allowed `nsPerOp(fn) / calibration`. Tune to ≈3× a healthy run. */
  budget: number;
}

/**
 * Measure `fn`, log its ns/op and ratio, and assert the ratio is within budget.
 * Returns the numbers so a caller can also assert finer invariants.
 */
export function perfGuard(
  label: string,
  fn: () => void,
  opts: GuardOptions,
): { nsPerOp: number; ratio: number } {
  const ref = calibrate();
  const nsPerOp = measureNsPerOp(fn, opts);
  const ratio = nsPerOp / ref;
  const tag = ratio <= opts.budget ? "OK  " : "SLOW";
  // eslint-disable-next-line no-console
  console.log(
    `[perf] ${tag} ${label.padEnd(38)} ${nsPerOp.toFixed(1).padStart(11)} ns/op   ` +
      `ratio=${ratio.toFixed(2).padStart(7)}x   budget=${opts.budget}x`,
  );
  expect(
    ratio,
    `${label}: ${ratio.toFixed(2)}x of calibration exceeds budget ${opts.budget}x ` +
      `(${nsPerOp.toFixed(1)} ns/op). A real regression — or retune the budget if intentional.`,
  ).toBeLessThanOrEqual(opts.budget);
  return { nsPerOp, ratio };
}

// ── Shared fixtures ─────────────────────────────────────────────────────────

/** A spread of distinct styles, to exercise style comparison/serialization. */
export const STYLE_SET: Style[] = [
  new Style(),
  new Style({ color: "#4daafc" }),
  new Style({ color: "#ff5555", background: "#1a1a1a", bold: true }),
  new Style({ color: "$accent", italic: true, underline: true }),
  new Style({ background: "#264f78", dim: true }),
  new Style({ color: "#50fa7b", strikethrough: true, reverse: true }),
  new Style({ color: "#f1fa8c", link: "https://example.com" }),
  new Style({ underline: true, underlineStyle: "curly", underlineColor: "#ff5555" }),
];

/**
 * A `width × height` buffer filled with varied glyphs and cycling styles — a
 * stand-in for a busy frame, used by the buffer and diff benchmarks.
 */
export function makeFilledBuffer(width: number, height: number): ScreenBuffer {
  const buf = new ScreenBuffer(width, height);
  const glyphs = "abcdef ghij██▏▌ klmno";
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = buf.cells[y][x];
      cell.char = glyphs[(x * 7 + y * 13) % glyphs.length];
      cell.style = STYLE_SET[(x + y) % STYLE_SET.length];
    }
  }
  return buf;
}

/** A representative markdown document: headings, lists, code, table, quote, inline marks. */
export const SAMPLE_MARKDOWN = [
  "# Release notes",
  "",
  "A **bold** claim, some _emphasis_, `inline code`, and a [link](https://x.dev).",
  "",
  "## Highlights",
  "",
  "- First item with a fairly long sentence that will need to wrap across the width.",
  "- Second item, `code` inside, and ~~struck~~ text.",
  "- Third item",
  "  - nested a",
  "  - nested b",
  "",
  "1. ordered one",
  "2. ordered two",
  "3. ordered three",
  "",
  "> [!NOTE]",
  "> A callout that re-lexes its body and keeps the raw markdown for copy.",
  "",
  "| Col A | Col B | Col C |",
  "| ----- | ----- | ----- |",
  "| 1     | two   | three |",
  "| 4     | five  | six   |",
  "",
  "```ts",
  "const x: number = 1;",
  "function add(a: number, b: number) { return a + b; }",
  "```",
  "",
  "Closing paragraph with more prose to give the wrapper and inline lexer real work.",
].join("\n");
