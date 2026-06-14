/**
 * Easing functions mapping a linear progress `t` in [0,1] to an eased progress,
 * also in [0,1] (with `back`/`elastic` deliberately overshooting). These are the
 * Penner-style curves used by Textual and CSS; pick one by name via {@link EASINGS}
 * so animation specs can pass a string rather than a function reference.
 */
/** Name of a built-in easing curve. */
export type EasingFn = (t: number) => number;

/** Name of a built-in easing curve. */
export type Easing =
  | "linear"
  | "in-quad"
  | "out-quad"
  | "in-out-quad"
  | "in-cubic"
  | "out-cubic"
  | "in-out-cubic"
  | "in-expo"
  | "out-expo"
  | "in-out-expo"
  | "out-back"
  | "out-elastic"
  | "out-bounce";

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

const BACK_C1 = 1.70158;
const BACK_C3 = BACK_C1 + 1;
const ELASTIC_C4 = (2 * Math.PI) / 3;

const outBounce: EasingFn = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) {
    const u = t - 1.5 / d1;
    return n1 * u * u + 0.75;
  }
  if (t < 2.5 / d1) {
    const u = t - 2.25 / d1;
    return n1 * u * u + 0.9375;
  }
  const u = t - 2.625 / d1;
  return n1 * u * u + 0.984375;
};

/** Built-in easing curves by name (see { Easing}). */
export const EASINGS: Record<Easing, EasingFn> = {
  linear: (t) => t,
  "in-quad": (t) => t * t,
  "out-quad": (t) => 1 - (1 - t) * (1 - t),
  "in-out-quad": (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  "in-cubic": (t) => t * t * t,
  "out-cubic": (t) => 1 - (1 - t) ** 3,
  "in-out-cubic": (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  "in-expo": (t) => (t === 0 ? 0 : 2 ** (10 * t - 10)),
  "out-expo": (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  "in-out-expo": (t) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2,
  "out-back": (t) => 1 + BACK_C3 * (t - 1) ** 3 + BACK_C1 * (t - 1) ** 2,
  "out-elastic": (t) =>
    t === 0 ? 0 : t === 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ELASTIC_C4) + 1,
  "out-bounce": outBounce,
};

/** Resolve an easing name (default `out-cubic`) to its function. */
export function resolveEasing(easing: Easing = "out-cubic"): EasingFn {
  return EASINGS[easing] ?? EASINGS["out-cubic"];
}

/**
 * Eased interpolation between two numbers. `t` is clamped to [0,1] first; the
 * named easing shapes the path. `back`/`elastic` may overshoot the endpoints
 * mid-flight by design but always resolve exactly to `to` at `t = 1`.
 */
export function interpolate(from: number, to: number, t: number, easing?: Easing): number {
  return from + (to - from) * resolveEasing(easing)(clamp01(t));
}
