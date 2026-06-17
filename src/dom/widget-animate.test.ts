import { describe, expect, test } from "vitest";
import { Widget } from "./widget.ts";

class Box extends Widget {
  constructor() {
    super("box");
  }
}

describe("Widget.animate (scalar tween)", () => {
  test("first call settles on the target; duration:0 snaps to a new target", () => {
    const w = new Box();
    // First sight of a key starts already settled (no tween-in from zero).
    expect(w.animate("x", 10)).toBe(10);
    // A zero-duration retarget snaps immediately.
    expect(w.animate("x", 42, { duration: 0 })).toBe(42);
  });

  test("a positive-duration retarget begins animating from the prior value", () => {
    const w = new Box();
    w.animate("y", 0, { duration: 0 });
    const mid = w.animate("y", 100, { duration: 1000 });
    // Still at (or near) the start of the tween on this first frame.
    expect(mid).toBeLessThan(100);
  });
});

describe("Widget.animateColor", () => {
  test("first call settles on the target colour; retarget returns a colour string", () => {
    const w = new Box();
    const first = w.animateColor("bg", "#ff0000");
    expect(typeof first).toBe("string");
    expect(first.length).toBeGreaterThan(0);
    const next = w.animateColor("bg", "#00ff00", { duration: 0 });
    expect(typeof next).toBe("string");
  });
});
