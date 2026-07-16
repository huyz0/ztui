import { describe, expect, test } from "vitest";
import { RadioGroupWidget } from "./radio-group.ts";

describe("RadioGroupWidget value/hoveredIndex sync", () => {
  test("setting value programmatically syncs hoveredIndex", () => {
    const w = new RadioGroupWidget();
    w.options = ["a", "b", "c"];
    w.value = "c";
    expect(w.hoveredIndex).toBe(2);
  });

  test("Enter without prior arrow-key navigation keeps the programmatically set value", () => {
    const w = new RadioGroupWidget();
    w.options = ["a", "b", "c"];
    w.value = "c"; // set programmatically, no arrow-key navigation yet
    let committed: string | undefined;
    w.onChange = (val) => {
      committed = val;
    };
    w.onKey?.({ name: "enter", key: "enter" } as any);
    // Without the hoveredIndex sync, this would silently revert to options[0] ("a").
    expect(committed).toBeUndefined(); // already selected -> commit() is a no-op
    expect(w.value).toBe("c");
  });

  test("value set to an option not in the list leaves hoveredIndex unchanged", () => {
    const w = new RadioGroupWidget();
    w.options = ["a", "b", "c"];
    w.hoveredIndex = 1;
    w.value = "not-an-option";
    expect(w.hoveredIndex).toBe(1);
  });
});

describe("RadioGroupWidget edge cases", () => {
  test("a key event with no options is a no-op", () => {
    const w = new RadioGroupWidget();
    w.options = [];
    const ev = { name: "down", key: "down" } as any;
    expect(() => w.onKey?.(ev)).not.toThrow();
    expect(ev.handled).toBeUndefined();
  });

  test("an already-handled mouse event is left untouched", () => {
    const w = new RadioGroupWidget();
    w.options = ["a", "b"];
    let committed: string | undefined;
    w.onChange = (v) => {
      committed = v;
    };
    w.handleMouse({ type: "press", button: "left", x: 0, y: 0, handled: true } as any);
    expect(committed).toBeUndefined();
  });
});
