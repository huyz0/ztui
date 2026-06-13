import { mix, parseColor, rgbStr } from "../render/color.ts";
import { resolveEasing } from "./easing.ts";

/**
 * "Breathing" — a slow, eased oscillation used to make an indicator feel alive
 * without moving or strobing. Shares the aesthetic of the smooth caret
 * (`smoothCaretIntensity`): a cosine driven through an in-out ease so the value
 * *lingers* at both poles with soft transitions between, rather than the
 * mechanical sweep of a raw sine.
 *
 * This is the engine behind two distinct ideas:
 *  - **Focus** ({@link FOCUS_BREATH}) — barely-there ambient pulse marking
 *    "you are here". Whisper-quiet by design.
 *  - **Attention** ({@link ATTENTION_BREATH}) — a deliberate, more pronounced
 *    pulse that pulls the eye to a panel asking for a decision (a permission
 *    prompt, a Q&A). Louder, faster, but still smooth.
 */
export interface BreatheSpec {
  /** Full oscillation period (dim → bright → dim) in milliseconds. */
  periodMs: number;
  /**
   * Peak blend fraction toward the highlight colour, in [0,1]. The pulse swings
   * between 0 (base colour) and this value — kept small so focus stays subtle.
   */
  amplitude: number;
}

/**
 * Ambient focus pulse: a slow, gentle glow. `amplitude` is the peak blend
 * toward the highlight *pole* (white on dark themes, black on light) — enough
 * to read as a living shimmer on an already-bright accent, but no colour change.
 */
export const FOCUS_BREATH: BreatheSpec = { periodMs: 2300, amplitude: 0.6 };

/** Deliberate "look here" pulse for attention panels: shorter, stronger. */
export const ATTENTION_BREATH: BreatheSpec = { periodMs: 1700, amplitude: 0.72 };

const easeBreath = resolveEasing("in-out-cubic");

/**
 * Eased breathing intensity in [0,1] for a given period, from a wall-clock time
 * in ms. 0 at the trough, 1 at the crest. Phase is anchored to absolute time so
 * every breathing indicator on screen pulses in unison (one shared rhythm reads
 * calmer than many drifting ones).
 */
export function breatheIntensity(nowMs: number, periodMs: number): number {
  const phase = (((nowMs % periodMs) + periodMs) % periodMs) / periodMs;
  // Cosine: 1 at phase 0, 0 at phase 0.5. Ease to linger at the extremes.
  const raw = (Math.cos(phase * Math.PI * 2) + 1) / 2;
  return easeBreath(raw);
}

/**
 * Blend `base` toward `hi` by a breathing amount, returning an `rgb(...)`
 * string. The result swings between `base` (trough) and `mix(base, hi,
 * amplitude)` (crest) — never reaching full `hi`, so the motion is a gentle
 * shimmer of the base colour rather than a colour change. Falls back to `base`
 * if either endpoint can't be parsed.
 */
export function breatheColor(base: string, hi: string, nowMs: number, spec: BreatheSpec): string {
  const baseRgb = parseColor(base)?.rgb;
  const hiRgb = parseColor(hi)?.rgb;
  if (!baseRgb || !hiRgb) return base;
  const t = spec.amplitude * breatheIntensity(nowMs, spec.periodMs);
  return rgbStr(mix(baseRgb, hiRgb, t));
}
