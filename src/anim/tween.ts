import { lerpColor } from "../render/color.ts";
import { type Easing, type EasingFn, resolveEasing } from "./easing.ts";

/**
 * Options shared by every tween: how long the motion lasts, the curve it
 * follows, and a one-shot callback when it lands.
 */
export interface TweenOptions {
  /** Tween duration in milliseconds. Default 300. */
  duration?: number;
  /** Easing curve name. Default `out-cubic`. */
  easing?: Easing;
  /** Called once when the tween reaches its target. */
  onComplete?: () => void;
}

/** Default tween duration (ms) when a caller doesn't specify one. */
const DEFAULT_DURATION = 300;

/**
 * A framework-agnostic, clock-driven scalar tween — the portable core of the
 * animation system. It holds no timers and triggers no re-renders: instead it
 * maps the real-time clock through an easing curve, so reading {@link value}
 * always returns the right number for "now". A driver (a widget's render loop,
 * a React effect, a Solid signal) decides *when* to read and re-render.
 *
 * Because every read derives from the wall clock, frame jitter never
 * accumulates drift — the value lands exactly on the target at the end of the
 * duration regardless of how irregularly it was sampled.
 *
 * Lifecycle:
 *  - {@link to} aims at a new target, tweening from the currently displayed value.
 *  - {@link value} reads the eased position at the present clock.
 *  - {@link animating} reports whether motion is still in flight, and fires
 *    `onComplete` exactly once as the tween settles.
 */
export class Tween {
  protected from: number;
  protected target: number;
  private startTime = 0;
  private duration = 0;
  private ease: EasingFn = resolveEasing();
  private onComplete?: () => void;
  private settled = true;

  constructor(initial: number) {
    this.from = initial;
    this.target = initial;
  }

  /**
   * Aim at a new target, tweening from the value shown right now (so retargeting
   * mid-flight is seamless). A no-op while already heading to the same target; a
   * non-positive duration snaps immediately.
   */
  public to(target: number, opts: TweenOptions = {}): void {
    // Already settled on, or already heading to, this target: nothing to do.
    if (target === this.target) return;

    this.from = this.value;
    this.target = target;
    this.duration = opts.duration ?? DEFAULT_DURATION;
    this.ease = resolveEasing(opts.easing);
    this.onComplete = opts.onComplete;
    this.startTime = Date.now();
    this.settled = this.duration <= 0 || this.from === target;
    if (this.settled) {
      this.from = target;
      this.onComplete?.();
      this.onComplete = undefined;
    }
  }

  /** Jump straight to `value` with no motion, cancelling any tween in flight. */
  public set(value: number): void {
    this.from = value;
    this.target = value;
    this.settled = true;
    this.onComplete = undefined;
  }

  /** The value this tween is moving toward. */
  public get goal(): number {
    return this.target;
  }

  /** The eased value at the present clock. */
  public get value(): number {
    if (this.settled) return this.target;
    const t = (Date.now() - this.startTime) / this.duration;
    if (t >= 1) return this.target;
    return this.from + (this.target - this.from) * this.ease(t < 0 ? 0 : t);
  }

  /**
   * True while the tween is still moving. Reading this settles the tween and
   * fires `onComplete` exactly once when the duration has elapsed, so a driver
   * that loops `while (tween.animating)` gets the completion callback for free.
   */
  public get animating(): boolean {
    if (this.settled) return false;
    if (Date.now() - this.startTime >= this.duration) {
      this.settled = true;
      this.from = this.target;
      this.onComplete?.();
      this.onComplete = undefined;
      return false;
    }
    return true;
  }
}

/**
 * A {@link Tween} for CSS colours. Drives an internal 0→1 progress and
 * interpolates each channel, returning an `rgb(...)` string. Endpoints may be
 * hex, `rgb()`, or a basic colour name.
 */
export class ColorTween {
  private fromColor: string;
  private targetColor: string;
  private readonly progress: Tween;

  constructor(initial: string) {
    this.fromColor = initial;
    this.targetColor = initial;
    this.progress = new Tween(1);
  }

  public to(target: string, opts: TweenOptions = {}): void {
    if (target === this.targetColor && !this.progress.animating) return;
    this.fromColor = this.value;
    this.targetColor = target;
    // Restart 0→1 progress; the colour is derived from it on each read.
    this.progress.set(0);
    this.progress.to(1, opts);
  }

  public set(value: string): void {
    this.fromColor = value;
    this.targetColor = value;
    this.progress.set(1);
  }

  public get goal(): string {
    return this.targetColor;
  }

  public get value(): string {
    const t = this.progress.value;
    if (t >= 1) return this.targetColor;
    return lerpColor(this.fromColor, this.targetColor, t);
  }

  public get animating(): boolean {
    return this.progress.animating;
  }
}
