import { useEffect, useRef, useState } from "react";
import type { Easing } from "../anim/easing.ts";
import { ColorTween, Tween, type TweenOptions } from "../anim/tween.ts";

/** Options for the animation hooks/tweens: duration, easing, onComplete. */
export type AnimationOptions = TweenOptions;

// One tick ≈ 60fps. The hook re-renders the owning component each tick, so the
// cadence is intentionally modest to stay friendly to the diff-based terminal
// backend (where every frame is an ANSI repaint).
const FRAME_MS = 16;

/** The slice of {@link Tween}/{@link ColorTween} this hook drives. */
interface TweenLike<T> {
  to(target: T, opts: TweenOptions): void;
  readonly animating: boolean;
  readonly value: T;
}

/**
 * Shared engine for the animated-value hooks: lazily create one tween, retarget
 * it whenever `target`/timing changes, and force a re-render each ~60fps tick
 * while motion is in flight. The value is always read straight off the engine,
 * so it's correct for the current clock regardless of when React re-renders.
 */
function useTween<T>(create: () => TweenLike<T>, target: T, opts: AnimationOptions): T {
  const { duration = 300, easing = "out-cubic", onComplete } = opts;
  const tween = useRef<TweenLike<T>>(undefined as unknown as TweenLike<T>);
  if (tween.current === undefined) tween.current = create();
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
 * Drive a tween over `[duration]` whenever `target` changes, returning the
 * current in-flight value. A thin React adapter over the framework-agnostic
 * {@link Tween} engine — the same interpolation widgets use via
 * `Widget.animate`, so motion is identical across bindings.
 *
 * Use this to smoothly move a number (opacity, width, a scroll offset, a gauge
 * reading) instead of snapping.
 */
export function useAnimatedValue(target: number, opts: AnimationOptions = {}): number {
  return useTween(() => new Tween(target), target, opts);
}

/**
 * Like {@link useAnimatedValue} but tweens a CSS colour, returning an
 * `rgb(...)` string. Backed by the core {@link ColorTween}. Endpoints may be
 * hex, `rgb()`, or a basic colour name.
 */
export function useAnimatedColor(target: string, opts: AnimationOptions = {}): string {
  return useTween(() => new ColorTween(target), target, opts);
}

export type { Easing };
