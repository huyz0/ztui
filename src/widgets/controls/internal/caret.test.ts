import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  blendCaretColors,
  CaretBlink,
  HARD_CARET_HALF_PERIOD,
  SMOOTH_CARET_PERIOD,
  SMOOTH_CARET_TICK,
  smoothCaretIntensity,
} from "./caret.ts";

describe("CaretBlink", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("hard mode toggles visibility on each half-period tick", () => {
    const repaint = vi.fn();
    const blink = new CaretBlink(repaint);
    blink.start();
    expect(blink.visible).toBe(true);
    vi.advanceTimersByTime(HARD_CARET_HALF_PERIOD);
    expect(blink.visible).toBe(false);
    expect(repaint).toHaveBeenCalled();
    vi.advanceTimersByTime(HARD_CARET_HALF_PERIOD);
    expect(blink.visible).toBe(true);
    blink.stop();
  });

  test("smooth mode repaints at the animation cadence without toggling visible", () => {
    const repaint = vi.fn();
    const blink = new CaretBlink(repaint);
    blink.smooth = true;
    blink.start();
    const calls = repaint.mock.calls.length;
    vi.advanceTimersByTime(SMOOTH_CARET_TICK * 3);
    expect(repaint.mock.calls.length).toBeGreaterThan(calls);
    expect(blink.visible).toBe(true); // smooth mode never flips the boolean
    blink.stop();
  });

  test("start() restarts an already-running blink loop (clears the prior interval)", () => {
    const repaint = vi.fn();
    const blink = new CaretBlink(repaint);
    blink.start();
    blink.start(); // second call must clear the first interval, not stack a second one
    repaint.mockClear();
    vi.advanceTimersByTime(HARD_CARET_HALF_PERIOD);
    // Exactly one toggle's worth of repaint calls — not two overlapping loops.
    expect(repaint).toHaveBeenCalledTimes(1);
    blink.stop();
  });

  test("stop() clears the interval and hides the caret; is idempotent", () => {
    const repaint = vi.fn();
    const blink = new CaretBlink(repaint);
    blink.start();
    blink.stop();
    expect(blink.visible).toBe(false);
    repaint.mockClear();
    vi.advanceTimersByTime(HARD_CARET_HALF_PERIOD * 2);
    expect(repaint).not.toHaveBeenCalled();
    // Calling stop() again with no active interval must be a no-op, not throw.
    expect(() => blink.stop()).not.toThrow();
  });
});

describe("smoothCaretIntensity", () => {
  test("is fully lit at the start of the cycle and dark at the midpoint", () => {
    expect(smoothCaretIntensity(0)).toBeCloseTo(1, 5);
    expect(smoothCaretIntensity(SMOOTH_CARET_PERIOD / 2)).toBeCloseTo(0, 5);
    expect(smoothCaretIntensity(SMOOTH_CARET_PERIOD)).toBeCloseTo(1, 5);
  });

  test("stays within [0,1] across the cycle and wraps for large/negative input", () => {
    for (let i = 0; i <= 12; i++) {
      const v = smoothCaretIntensity((SMOOTH_CARET_PERIOD * i) / 12);
      expect(v).toBeGreaterThanOrEqual(-1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    }
    // Phase wraps, so t and t+period match; negatives are handled too.
    expect(smoothCaretIntensity(SMOOTH_CARET_PERIOD * 3.25)).toBeCloseTo(
      smoothCaretIntensity(SMOOTH_CARET_PERIOD * 0.25),
      5,
    );
    expect(smoothCaretIntensity(-SMOOTH_CARET_PERIOD / 2)).toBeCloseTo(0, 5);
  });
});

describe("blendCaretColors", () => {
  const focus = "#00ffff";
  const bg = "#000000";
  const fg = "#ffffff";

  test("block caret fades its glyph from the surface up to the focus colour", () => {
    expect(blendCaretColors(1, focus, bg, fg, true)).toEqual({
      color: "rgb(0, 255, 255)",
      background: "#000000",
    });
    expect(blendCaretColors(0, focus, bg, fg, true)).toEqual({
      color: "rgb(0, 0, 0)", // invisible against bg
      background: "#000000",
    });
  });

  test("over a character: glyph eases to a colour contrasting the lit caret", () => {
    // focus #00ffff is light (luminance > 0.5) → lit glyph eases toward black.
    expect(blendCaretColors(1, focus, bg, fg, false)).toEqual({
      color: "rgb(0, 0, 0)", // contrasts the cyan caret
      background: "rgb(0, 255, 255)",
    });
    // Caret dark → glyph restored to its original colour on the surface.
    expect(blendCaretColors(0, focus, bg, fg, false)).toEqual({
      color: "rgb(255, 255, 255)",
      background: "rgb(0, 0, 0)",
    });
  });

  test("over a character: dark caret colour picks a white contrast", () => {
    // focus #102040 is dark → lit glyph eases toward white instead.
    const lit = blendCaretColors(1, "#102040", bg, "#ff0000", false);
    expect(lit.color).toBe("rgb(255, 255, 255)");
  });

  test("clamps intensity and tolerates unparseable colours", () => {
    expect(blendCaretColors(2, focus, bg, fg, true).color).toBe("rgb(0, 255, 255)");
    // Negative intensity clamps to 0, same as the fully-dark endpoint.
    expect(blendCaretColors(-1, focus, bg, fg, true)).toEqual(
      blendCaretColors(0, focus, bg, fg, true),
    );
    // Bad focus colour falls back to the lit endpoint rather than blanking.
    expect(blendCaretColors(0.5, "nonsense", bg, fg, true).color).toBe("nonsense");
  });
});
