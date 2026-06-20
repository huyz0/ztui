/**
 * Phase-attributed frame profiler. Splits the per-frame cost of
 * {@link App.layoutAndRender} into named phases (restyle → measure → layout →
 * render → diff → write) and tracks how many frames were *redundant* (ran the
 * pipeline but emitted zero bytes to the terminal).
 *
 * The headline `app.perf` guard times a whole forced frame as one number; this
 * answers the next question — *which phase* of that frame dominates, and how
 * much work is wasted re-running the pipeline for no visible change.
 *
 * **Zero cost when disabled.** The live render path calls {@link now} and
 * {@link record} unconditionally, but both short-circuit on a single boolean
 * read when `enabled` is false: no `performance.now()` syscall, no allocation,
 * no Map touch. Profiling is opt-in (a harness toggles it; production never
 * does), so steady-state rendering pays nothing.
 */

/** The phases a frame is split into, in pipeline order. */
export type FramePhase = "restyle" | "measure" | "layout" | "render" | "diff" | "write";

/** All phases, in display/pipeline order. */
export const FRAME_PHASES: readonly FramePhase[] = [
  "restyle",
  "measure",
  "layout",
  "render",
  "diff",
  "write",
];

interface PhaseStat {
  /** Total nanoseconds spent in this phase across all sampled frames. */
  ns: number;
  /** Number of timed spans (a phase can be timed more than once per frame). */
  count: number;
}

/** A per-phase line in a {@link FrameProfileReport}. */
export interface PhaseLine {
  phase: FramePhase;
  /** Total milliseconds across all frames. */
  totalMs: number;
  /** Average microseconds per *frame* (total ns / frames / 1000). */
  perFrameUs: number;
  /** Share of summed phase time, 0..1. */
  share: number;
}

/** A snapshot of accumulated profiling, ready to format. */
export interface FrameProfileReport {
  /** Frames whose pipeline ran (full + partial). */
  frames: number;
  fullFrames: number;
  partialFrames: number;
  /** Frames that wrote bytes to the terminal. */
  emittedFrames: number;
  /** Frames that ran the whole pipeline but emitted nothing (wasted work). */
  redundantFrames: number;
  /** redundantFrames / frames, 0..1. */
  redundantRate: number;
  /** Total bytes written across emitted frames. */
  bytes: number;
  /** Per-phase breakdown, in pipeline order. */
  phases: PhaseLine[];
  /** Summed phase time across all phases, milliseconds. */
  totalMs: number;
}

/**
 * Process-wide profiler. A singleton so a harness can toggle it and read it back
 * without threading an instance through {@link App}. Off by default.
 */
export class FrameProfiler {
  private static _instance: FrameProfiler | null = null;
  public static get instance(): FrameProfiler {
    if (!FrameProfiler._instance) FrameProfiler._instance = new FrameProfiler();
    return FrameProfiler._instance;
  }

  /** Master switch. While false every method is a cheap boolean check. */
  public enabled = false;

  private phases = new Map<FramePhase, PhaseStat>();
  private _frames = 0;
  private _full = 0;
  private _partial = 0;
  private _emitted = 0;
  private _bytes = 0;

  /**
   * Start timing a phase. Returns a token to pass to {@link record}; returns `0`
   * (and does no work) when disabled, so callers can write the span inline
   * without a guard.
   */
  public now(): number {
    return this.enabled ? performance.now() : 0;
  }

  /** Add the time since `start` (a {@link now} token) to `phase`. No-op when disabled. */
  public record(phase: FramePhase, start: number): void {
    if (!this.enabled) return;
    const elapsedNs = (performance.now() - start) * 1e6;
    const stat = this.phases.get(phase);
    if (stat) {
      stat.ns += elapsedNs;
      stat.count++;
    } else {
      this.phases.set(phase, { ns: elapsedNs, count: 1 });
    }
  }

  /** Record one completed frame's outcome. No-op when disabled. */
  public frame(opts: { full: boolean; emitted: boolean; bytes: number }): void {
    if (!this.enabled) return;
    this._frames++;
    if (opts.full) this._full++;
    else this._partial++;
    if (opts.emitted) {
      this._emitted++;
      this._bytes += opts.bytes;
    }
  }

  /** Clear all accumulated counters (call between scenarios). */
  public reset(): void {
    this.phases.clear();
    this._frames = 0;
    this._full = 0;
    this._partial = 0;
    this._emitted = 0;
    this._bytes = 0;
  }

  /** Snapshot the accumulated stats as a structured report. */
  public report(): FrameProfileReport {
    const frames = this._frames;
    const totalNs = FRAME_PHASES.reduce((sum, p) => sum + (this.phases.get(p)?.ns ?? 0), 0);
    const phases: PhaseLine[] = FRAME_PHASES.map((phase) => {
      const ns = this.phases.get(phase)?.ns ?? 0;
      return {
        phase,
        totalMs: ns / 1e6,
        perFrameUs: frames > 0 ? ns / frames / 1e3 : 0,
        share: totalNs > 0 ? ns / totalNs : 0,
      };
    });
    return {
      frames,
      fullFrames: this._full,
      partialFrames: this._partial,
      emittedFrames: this._emitted,
      redundantFrames: frames - this._emitted,
      redundantRate: frames > 0 ? (frames - this._emitted) / frames : 0,
      bytes: this._bytes,
      phases,
      totalMs: totalNs / 1e6,
    };
  }
}

/** The shared profiler the render path writes to. */
export const frameProfiler = FrameProfiler.instance;
