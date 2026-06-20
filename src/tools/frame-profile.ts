/**
 * Phase-attributed frame profiler harness. Mounts a gallery demo headlessly,
 * drives it through forced-frame scenarios, and prints where each frame's time
 * goes (restyle → measure → layout → render → diff → write) plus how many frames
 * were redundant (ran the whole pipeline but emitted nothing).
 *
 * Two scenarios isolate the two costs an app actually pays:
 *
 * - **redundant** — re-run a full frame over an *unchanged* tree. The diff finds
 *   nothing, so zero bytes are written. This is the cost of a wasted
 *   `queueRender` (a state update that resolves to the same pixels) — restyle +
 *   measure + layout + render, paid for nothing.
 * - **repaint** — invalidate the retained buffer each frame so the whole screen
 *   re-emits. Adds the real diff + write cost on top. This is the worst-case
 *   "everything changed" frame.
 *
 * Subtracting the two isolates diff+write (only paid when something emits) from
 * the layout/render work paid on every frame. Run via `bun run profile`.
 */

import type { ReactNode } from "react";
import { type FrameProfileReport, frameProfiler } from "../core/frame-profiler.ts";
import { mountTestApp } from "./app-mount.tsx";

/** A frame-forcing mode (see module doc). */
export type ProfileMode = "redundant" | "repaint";

/** Private App internals the harness pokes to force synchronous frames. */
interface AppInternals {
  needsLayout: boolean;
  repaintFull: boolean;
  layoutAndRender: () => void;
  prevBuffer: { resize: (w: number, h: number) => void };
}

export interface ProfileOptions {
  /** Label for the report header (e.g. the demo id). */
  label?: string;
  cols?: number;
  rows?: number;
  iterations?: number;
  warmup?: number;
}

/** One scenario's report plus the label and frame count it ran. */
export interface ScenarioResult {
  mode: ProfileMode;
  iterations: number;
  report: FrameProfileReport;
}

/** Force one synchronous full frame over the current (unchanged) tree. */
function forceFullFrame(a: AppInternals): void {
  a.needsLayout = true;
  a.repaintFull = true;
  a.layoutAndRender();
}

/** Force a frame that re-emits every cell (invalidate the retained buffer first). */
function forceRepaintFrame(a: AppInternals): void {
  a.prevBuffer.resize(0, 0);
  forceFullFrame(a);
}

/**
 * Run one scenario: warm up (untimed), then drive `iterations` forced frames
 * with the profiler recording. Returns the accumulated report.
 */
export function profileScenario(
  app: unknown,
  mode: ProfileMode,
  iterations: number,
  warmup: number,
): ScenarioResult {
  const a = app as AppInternals;
  const drive = mode === "repaint" ? forceRepaintFrame : forceFullFrame;

  frameProfiler.enabled = true;
  try {
    frameProfiler.reset();
    for (let i = 0; i < warmup; i++) drive(a);
    frameProfiler.reset(); // drop warmup; measure only the steady-state frames
    for (let i = 0; i < iterations; i++) drive(a);
    return { mode, iterations, report: frameProfiler.report() };
  } finally {
    // Never leave profiling on if a forced frame throws.
    frameProfiler.enabled = false;
  }
}

/** Mount a UI and run both scenarios against it. */
export async function runProfile(
  ui: ReactNode,
  opts: ProfileOptions = {},
): Promise<{ label: string; cols: number; rows: number; scenarios: ScenarioResult[] }> {
  const { label = "ui", cols = 120, rows = 40, iterations = 200, warmup = 30 } = opts;

  const t = await mountTestApp(ui, { cols, rows });
  await t.settle();

  const scenarios: ScenarioResult[] = [
    profileScenario(t.app, "redundant", iterations, warmup),
    profileScenario(t.app, "repaint", iterations, warmup),
  ];
  return { label, cols, rows, scenarios };
}

/** Right-pad. */
function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
/** Left-pad. */
function lpad(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

function bar(share: number, width = 16): string {
  const filled = Math.round(share * width);
  return "█".repeat(filled) + "·".repeat(width - filled);
}

/** Format a single scenario report as a phase table. */
export function formatReport(result: ScenarioResult): string {
  const r = result.report;
  const lines: string[] = [];
  const perFrameTotalUs = r.frames > 0 ? (r.totalMs * 1000) / r.frames : 0;
  lines.push(
    `── ${result.mode}  (${r.frames} frames, ${r.emittedFrames} emitted, ` +
      `${(r.redundantRate * 100).toFixed(0)}% redundant, ` +
      `${(r.bytes / Math.max(1, r.emittedFrames)).toFixed(0)} B/emit) ─` +
      `  ${perFrameTotalUs.toFixed(1)} µs/frame`,
  );
  lines.push(`   ${pad("phase", 9)} ${lpad("µs/frame", 10)} ${lpad("share", 7)}  ${pad("", 16)}`);
  for (const p of r.phases) {
    const share = lpad(`${(p.share * 100).toFixed(1)}%`, 7);
    lines.push(
      `   ${pad(p.phase, 9)} ${lpad(p.perFrameUs.toFixed(2), 10)} ${share}  ${bar(p.share)}`,
    );
  }
  return lines.join("\n");
}

/** Format the whole run (header + every scenario). */
export function formatRun(run: {
  label: string;
  cols: number;
  rows: number;
  scenarios: ScenarioResult[];
}): string {
  const head = `Frame profile — "${run.label}" at ${run.cols}×${run.rows}`;
  return [head, "", ...run.scenarios.map(formatReport)].join("\n");
}
