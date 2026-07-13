import { describe, expect, test } from "vitest";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { SliderWidget } from "./slider.ts";

describe("SliderWidget drag/click scrubbing", () => {
  test("a zero step doesn't divide-by-zero into NaN", () => {
    // Regression: steppedVal = Math.round(rawVal / this.step) * this.step
    // divided by `step` unconditionally. A step of 0 (e.g. computed from a
    // range that collapses to zero) produced NaN, which then permanently
    // corrupted `value` — every subsequent render/onChange saw NaN.
    const w = new SliderWidget();
    w.min = 0;
    w.max = 100;
    w.step = 0;
    w.region = new Region(Offset.ORIGIN, new Size(20, 1));

    w.handleMouse({ type: "press", button: "left", x: 10, y: 0, handled: false });
    expect(Number.isNaN(w.value)).toBe(false);
    expect(w.value).toBeGreaterThanOrEqual(w.min);
    expect(w.value).toBeLessThanOrEqual(w.max);

    w.handleMouse({ type: "drag", button: "left", x: 15, y: 0, handled: false });
    expect(Number.isNaN(w.value)).toBe(false);
  });
});

describe("SliderWidget.getAccessibleNode", () => {
  test("reports role, value, and range/step state", () => {
    const w = new SliderWidget();
    w.min = 0;
    w.max = 50;
    w.step = 5;
    w.value = 20;
    // A slider is interactive (focusable), so the generic base doesn't skip it.
    const node = w.getAccessibleNode();
    expect(node?.role).toBe("slider");
    expect(node?.value).toBe("20");
    expect(node?.state).toContain("range 0-50");
    expect(node?.state).toContain("step 5");
  });
});
