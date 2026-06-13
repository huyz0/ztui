import { describe, expect, test } from "vitest";
import { pageStep, scrollTopForKey, selectionDeltaForKey } from "./key-nav.ts";

describe("pageStep", () => {
  test("is one viewport minus an overlap row, floored at 1", () => {
    expect(pageStep(10)).toBe(9);
    expect(pageStep(1)).toBe(1);
    expect(pageStep(0)).toBe(1);
  });
});

describe("scrollTopForKey", () => {
  const max = 100;
  const visible = 10; // page = 9

  test("line steps clamp at both ends", () => {
    expect(scrollTopForKey("up", 0, max, visible)).toBe(0);
    expect(scrollTopForKey("up", 5, max, visible)).toBe(4);
    expect(scrollTopForKey("down", 5, max, visible)).toBe(6);
    expect(scrollTopForKey("down", max, max, visible)).toBe(max);
  });

  test("page steps move by a page and clamp", () => {
    expect(scrollTopForKey("pagedown", 0, max, visible)).toBe(9);
    expect(scrollTopForKey("pageup", 5, max, visible)).toBe(0);
    expect(scrollTopForKey("pagedown", 95, max, visible)).toBe(max);
  });

  test("home/end jump to bounds", () => {
    expect(scrollTopForKey("home", 50, max, visible)).toBe(0);
    expect(scrollTopForKey("end", 50, max, visible)).toBe(max);
  });

  test("returns null for unrelated keys", () => {
    expect(scrollTopForKey("left", 5, max, visible)).toBeNull();
    expect(scrollTopForKey("enter", 5, max, visible)).toBeNull();
  });
});

describe("selectionDeltaForKey", () => {
  const visible = 10; // page = 9
  const count = 200;

  test("line and page deltas", () => {
    expect(selectionDeltaForKey("up", visible, count)).toBe(-1);
    expect(selectionDeltaForKey("down", visible, count)).toBe(1);
    expect(selectionDeltaForKey("pageup", visible, count)).toBe(-9);
    expect(selectionDeltaForKey("pagedown", visible, count)).toBe(9);
  });

  test("home/end saturate against list bounds", () => {
    expect(selectionDeltaForKey("home", visible, count)).toBe(-count);
    expect(selectionDeltaForKey("end", visible, count)).toBe(count);
  });

  test("returns null for unrelated keys", () => {
    expect(selectionDeltaForKey("enter", visible, count)).toBeNull();
  });
});
