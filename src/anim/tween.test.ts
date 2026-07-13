import { describe, expect, test, vi } from "vitest";
import { ColorTween, Tween } from "./tween.ts";

describe("Tween", () => {
  test("reads its initial value before any motion", () => {
    const t = new Tween(42);
    expect(t.value).toBe(42);
    expect(t.animating).toBe(false);
  });

  test("interpolates by the clock and lands exactly on target", () => {
    vi.useFakeTimers();
    try {
      const t = new Tween(0);
      t.to(100, { duration: 100, easing: "linear" });
      expect(t.animating).toBe(true);
      vi.advanceTimersByTime(50);
      expect(t.value).toBeCloseTo(50, 5);
      vi.advanceTimersByTime(60); // past the end
      expect(t.value).toBe(100);
      expect(t.animating).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test("retargeting mid-flight tweens from the current value", () => {
    vi.useFakeTimers();
    try {
      const t = new Tween(0);
      t.to(100, { duration: 100, easing: "linear" });
      vi.advanceTimersByTime(50); // at ~50
      t.to(0, { duration: 100, easing: "linear" });
      // New tween starts from ~50, not 100.
      expect(t.value).toBeCloseTo(50, 0);
      vi.advanceTimersByTime(50);
      expect(t.value).toBeCloseTo(25, 0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a zero duration snaps and fires onComplete once", () => {
    const done = vi.fn();
    const t = new Tween(0);
    t.to(10, { duration: 0, onComplete: done });
    expect(t.value).toBe(10);
    expect(t.animating).toBe(false);
    expect(done).toHaveBeenCalledTimes(1);
  });

  test("onComplete fires exactly once as the tween settles", () => {
    vi.useFakeTimers();
    try {
      const done = vi.fn();
      const t = new Tween(0);
      t.to(1, { duration: 100, easing: "linear", onComplete: done });
      vi.advanceTimersByTime(120);
      // First read past the end settles + fires; subsequent reads don't re-fire.
      expect(t.animating).toBe(false);
      expect(t.animating).toBe(false);
      expect(done).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("re-calling to() with the same target mid-flight swaps in the new onComplete instead of dropping it", () => {
    vi.useFakeTimers();
    try {
      const stale = vi.fn();
      const fresh = vi.fn();
      const t = new Tween(0);
      t.to(10, { duration: 100, easing: "linear", onComplete: stale });
      vi.advanceTimersByTime(50);
      // Same target re-targeted mid-flight (e.g. a re-render passing a fresh
      // closure) must not silently keep the stale callback.
      t.to(10, { duration: 100, easing: "linear", onComplete: fresh });
      vi.advanceTimersByTime(60);
      expect(t.animating).toBe(false);
      expect(fresh).toHaveBeenCalledTimes(1);
      expect(stale).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test("re-calling to() with the same target after settling fires the new onComplete immediately", () => {
    const t = new Tween(10);
    t.set(10); // already settled at 10
    const done = vi.fn();
    t.to(10, { onComplete: done });
    expect(done).toHaveBeenCalledTimes(1);
    expect(t.animating).toBe(false);
  });
});

describe("ColorTween", () => {
  test("interpolates between two colours and lands on target", () => {
    vi.useFakeTimers();
    try {
      const t = new ColorTween("#000000");
      t.to("#ffffff", { duration: 100, easing: "linear" });
      vi.advanceTimersByTime(50);
      // Halfway: a mid grey, not either endpoint.
      const mid = t.value;
      expect(mid).not.toBe("#000000");
      expect(mid).not.toBe("#ffffff");
      vi.advanceTimersByTime(60);
      expect(t.value).toBe("#ffffff");
      expect(t.animating).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test("re-calling to() every frame with the same target still converges (call-every-frame pattern)", () => {
    // Regression: a render-loop-driven animation calls `to(target)` on every
    // frame with the same target — this must be idempotent (like the plain
    // Tween), not restart the 0->1 progress from scratch each time, or the
    // color would never advance past the first frame's tiny eased step.
    vi.useFakeTimers();
    try {
      const t = new ColorTween("#000000");
      t.to("#ffffff", { duration: 100, easing: "linear" });
      vi.advanceTimersByTime(50);
      t.to("#ffffff", { duration: 100, easing: "linear" }); // same call, mid-flight
      vi.advanceTimersByTime(50);
      t.to("#ffffff", { duration: 100, easing: "linear" });
      expect(t.value).toBe("#ffffff");
      expect(t.animating).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test("re-calling to() with the same target mid-flight swaps in the new onComplete", () => {
    vi.useFakeTimers();
    try {
      const t = new ColorTween("#000000");
      const first = vi.fn();
      const second = vi.fn();
      t.to("#ffffff", { duration: 100, easing: "linear", onComplete: first });
      vi.advanceTimersByTime(50);
      t.to("#ffffff", { duration: 100, easing: "linear", onComplete: second });
      vi.advanceTimersByTime(60);
      expect(t.animating).toBe(false);
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
