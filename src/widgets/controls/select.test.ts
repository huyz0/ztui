import { describe, expect, test, vi } from "vitest";
import { SelectWidget } from "./select.ts";

describe("SelectWidget option logic", () => {
  test("resolves string and object options to a uniform shape", () => {
    const w = new SelectWidget();
    w.options = ["plain", { label: "Rich", value: "r" }];
    const resolved = w.getResolvedOptions();
    expect(resolved[0]).toEqual({ label: "plain", value: "plain" });
    expect(resolved[1]).toEqual({ label: "Rich", value: "r" });
  });

  test("single-select replaces the value and fires onChange", () => {
    const onChange = vi.fn();
    const w = new SelectWidget();
    w.options = ["a", "b"];
    w.onChange = onChange;
    w.toggleOption("a");
    expect(w.value).toBe("a");
    w.toggleOption("b");
    expect(w.value).toBe("b");
    expect(onChange).toHaveBeenLastCalledWith("b");
    expect(w.isOptionSelected("b")).toBe(true);
    expect(w.isOptionSelected("a")).toBe(false);
  });

  test("multi-select adds then removes a value, tracking membership", () => {
    const changes: string[][] = [];
    const w = new SelectWidget();
    w.multiple = true;
    w.options = ["x", "y", "z"];
    w.onChange = (v) => changes.push(v as string[]);
    w.toggleOption("x");
    w.toggleOption("y");
    expect(w.isOptionSelected("x")).toBe(true);
    expect(w.isOptionSelected("y")).toBe(true);
    w.toggleOption("x"); // remove
    expect(w.isOptionSelected("x")).toBe(false);
    expect(changes.at(-1)).toEqual(["y"]);
  });

  test("selectOptionIndex picks by position and ignores out-of-range indices", () => {
    const w = new SelectWidget();
    w.options = ["one", "two"];
    w.selectOptionIndex(1);
    expect(w.value).toBe("two");
    w.selectOptionIndex(99); // out of range — no change, no throw
    expect(w.value).toBe("two");
  });

  test("openDropdown is a no-op without a mounted screen", () => {
    const w = new SelectWidget();
    w.options = ["a"];
    expect(() => w.openDropdown()).not.toThrow();
  });
});
