import { describe, expect, test } from "vitest";
import type { MouseEvent } from "../../driver/driver.ts";
import { SplitterWidget } from "./splitter.ts";

function mouse(x: number, y: number, type: MouseEvent["type"]): MouseEvent {
  return { x, y, type, button: "left" } as MouseEvent;
}

describe("SplitterWidget", () => {
  test("vertical splitter reports horizontal drag deltas after a press", () => {
    const s = new SplitterWidget();
    s.orientation = "vertical";
    const deltas: number[] = [];
    s.onResize = (d) => deltas.push(d);

    s.handleMouse(mouse(10, 5, "press"));
    s.handleMouse(mouse(13, 5, "drag")); // +3
    s.handleMouse(mouse(11, 5, "drag")); // -2
    expect(deltas).toEqual([3, -2]);
  });

  test("horizontal splitter reports vertical drag deltas", () => {
    const s = new SplitterWidget();
    s.orientation = "horizontal";
    const deltas: number[] = [];
    s.onResize = (d) => deltas.push(d);

    s.handleMouse(mouse(5, 10, "press"));
    s.handleMouse(mouse(5, 7, "drag")); // -3
    expect(deltas).toEqual([-3]);
  });

  test("ignores drag before a press and after release", () => {
    const s = new SplitterWidget();
    const deltas: number[] = [];
    s.onResize = (d) => deltas.push(d);

    s.handleMouse(mouse(13, 5, "drag")); // no press yet → ignored
    s.handleMouse(mouse(10, 5, "press"));
    s.handleMouse(mouse(12, 5, "drag")); // +2
    s.handleMouse(mouse(12, 5, "release"));
    s.handleMouse(mouse(20, 5, "drag")); // after release → ignored
    expect(deltas).toEqual([2]);
  });
});
