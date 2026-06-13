import { useEffect, useRef, useState } from "react";
import type { Easing } from "../core/easing.ts";
import { ColorTween, Tween, type TweenOptions } from "../core/tween.ts";

export type AnimationOptions = TweenOptions;

// One tick ≈ 60fps. The hook re-renders the owning component each tick, so the
// cadence is intentionally modest to stay friendly to the diff-based terminal
// backend (where every frame is an ANSI repaint).
const FRAME_MS = 16;

/**
 * Drive a tween over `[duration]` whenever `target` changes, returning the
 * current in-flight value. A thin React adapter over the framework-agnostic
 * {@link Tween} engine — the same interpolation widgets use via
 * `Widget.animate`, so motion is identical across bindings.
 *
 * Use this to smoothly move a number (opacity, width, a scroll offset, a gauge
 * reading) instead of snapping.
 */
export function useAnimatedValue(target: number, opts: AnimationOptions = {}): number {
  const { duration = 300, easing = "out-cubic", onComplete } = opts;
  const tween = useRef<Tween>(undefined as unknown as Tween);
  if (tween.current === undefined) tween.current = new Tween(target);
  // A counter purely to force re-renders as the tween advances; the value is
  // read straight off the engine so it's always correct for the current clock.
  const [, force] = useState(0);
  const done = useRef(onComplete);
  done.current = onComplete;

  useEffect(() => {
    const tw = tween.current;
    tw.to(target, { duration, easing, onComplete: () => done.current?.() });
    if (!tw.animating) {
      force((n) => n + 1);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const step = () => {
      force((n) => n + 1);
      if (tw.animating) {
        timer = setTimeout(step, FRAME_MS);
        (timer as { unref?: () => void }).unref?.();
      }
    };
    step();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [target, duration, easing]);

  return tween.current.value;
}

/**
 * Like {@link useAnimatedValue} but tweens a CSS colour, returning an
 * `rgb(...)` string. Backed by the core {@link ColorTween}. Endpoints may be
 * hex, `rgb()`, or a basic colour name.
 */
export function useAnimatedColor(target: string, opts: AnimationOptions = {}): string {
  const { duration = 300, easing = "out-cubic", onComplete } = opts;
  const tween = useRef<ColorTween>(undefined as unknown as ColorTween);
  if (tween.current === undefined) tween.current = new ColorTween(target);
  const [, force] = useState(0);
  const done = useRef(onComplete);
  done.current = onComplete;

  useEffect(() => {
    const tw = tween.current;
    tw.to(target, { duration, easing, onComplete: () => done.current?.() });
    if (!tw.animating) {
      force((n) => n + 1);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const step = () => {
      force((n) => n + 1);
      if (tw.animating) {
        timer = setTimeout(step, FRAME_MS);
        (timer as { unref?: () => void }).unref?.();
      }
    };
    step();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [target, duration, easing]);

  return tween.current.value;
}

export type { Easing };
