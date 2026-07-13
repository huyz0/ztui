import { describe, expect, test } from "vitest";
import { SliderWidget } from "./slider.ts";

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
