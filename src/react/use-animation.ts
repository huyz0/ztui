import { useEffect, useRef, useState } from "react";
import { type Easing, resolveEasing } from "../core/easing.ts";
import { lerpColor } from "../render/color.ts";

export interface AnimationOptions {
  /** Tween duration in milliseconds. Default 300. */
  duration?: number;
  /** Easing curve name. Default `out-cubic`. */
  easing?: Easing;
  /** Called once when a tween reaches its target. */
  onComplete?: () => void;
}

// One tick ≈ 60fps. The driver re-renders the owning component each tick, so the
// cadence is intentionally modest to stay friendly to the diff-based terminal
// backend (where every frame is an ANSI repaint).
const FRAME_MS = 16;

/**
 * Drive a tween over `[duration]` whenever `target` changes, returning the
 * current in-flight value. Maps a real-time clock through the chosen easing, so
 * frame jitter never accumulates drift — the value lands exactly on `target`.
 *
 * Framework-level counterpart to the class-side {@link requestAnimationTick}:
 * use this from React components to smoothly move a number (opacity, width, a
 * scroll offset, a gauge reading) instead of snapping.
 */
export function useAnimatedValue(target: number, opts: AnimationOptions = {}): number {
  const { duration = 300, easing = "out-cubic", onComplete } = opts;
  const [value, setValue] = useState(target);
  // Latest displayed value and target, read inside the timer without re-arming
  // the effect on every frame. `done` always points at the newest onComplete so
  // the effect needn't list it as a dependency (which would restart the tween).
  const ref = useRef({ value: target, target });
  ref.current.value = value;
  const done = useRef(onComplete);
  done.current = onComplete;

  useEffect(() => {
    if (target === ref.current.target) return;
    const from = ref.current.value;
    ref.current.target = target;
    if (duration <= 0 || from === target) {
      setValue(target);
      done.current?.();
      return;
    }

    const ease = resolveEasing(easing);
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const step = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      setValue(from + (target - from) * ease(t));
      if (t < 1) {
        timer = setTimeout(step, FRAME_MS);
        (timer as { unref?: () => void }).unref?.();
      } else {
        done.current?.();
      }
    };
    step();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [target, duration, easing]);

  return value;
}

/**
 * Like {@link useAnimatedValue} but tweens a CSS colour, returning an
 * `rgb(...)` string. Drives an internal 0→1 progress and interpolates each
 * channel, so fades/highlight transitions read smoothly. Endpoints may be hex,
 * `rgb()`, or a basic colour name.
 */
export function useAnimatedColor(target: string, opts: AnimationOptions = {}): string {
  const { duration = 300, easing = "out-cubic", onComplete } = opts;
  const [color, setColor] = useState(target);
  const ref = useRef({ color: target, target });
  ref.current.color = color;
  const done = useRef(onComplete);
  done.current = onComplete;

  useEffect(() => {
    if (target === ref.current.target) return;
    const from = ref.current.color;
    ref.current.target = target;
    if (duration <= 0 || from === target) {
      setColor(target);
      done.current?.();
      return;
    }

    const ease = resolveEasing(easing);
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const step = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      setColor(lerpColor(from, target, ease(t)));
      if (t < 1) {
        timer = setTimeout(step, FRAME_MS);
        (timer as { unref?: () => void }).unref?.();
      } else {
        setColor(target);
        done.current?.();
      }
    };
    step();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [target, duration, easing]);

  return color;
}
