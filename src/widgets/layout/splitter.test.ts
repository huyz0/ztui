import { describe, expect, test } from "vitest";
import type { MouseEvent } from "../../driver/driver.ts";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
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

  test("reports a resize pointer shape matching its axis", () => {
    const v = new SplitterWidget();
    v.orientation = "vertical"; // resizes width → left/right
    expect(v.cursorShape).toBe("ew-resize");

    const h = new SplitterWidget();
    h.orientation = "horizontal"; // resizes height → up/down
    expect(h.cursorShape).toBe("ns-resize");
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

  test("release doesn't clear hover if the pointer is still over the splitter", () => {
    // Regression: "release" unconditionally cleared `hovered` regardless of
    // the pointer's actual position, so a drag-release on the same cell it
    // started on rendered the splitter thin/dim even though the mouse never
    // left it — it wouldn't look grabbable again until a fresh mouseenter,
    // which some drivers never fire without cursor movement.
    const s = new SplitterWidget();
    s.orientation = "vertical";
    s.region = new Region(new Offset(10, 0), new Size(1, 20));

    s.onMouseEnter?.({} as never);
    expect((s as unknown as { hovered: boolean }).hovered).toBe(true);

    s.handleMouse(mouse(10, 5, "press"));
    s.handleMouse(mouse(10, 5, "release")); // release on the same cell
    expect((s as unknown as { hovered: boolean }).hovered).toBe(true);

    // A release that lands off the splitter does clear hover.
    s.handleMouse(mouse(10, 5, "press"));
    s.handleMouse({ x: 30, y: 30, type: "release", button: "left" } as MouseEvent);
    expect((s as unknown as { hovered: boolean }).hovered).toBe(false);
  });

  test("mouse-leave while dragging keeps the grip highlighted", () => {
    const s = new SplitterWidget();
    s.onMouseEnter?.({} as never);
    expect((s as unknown as { hovered: boolean }).hovered).toBe(true);

    s.handleMouse(mouse(10, 5, "press"));
    // Leaving mid-drag must not clear `hovered` — the grip should stay
    // highlighted while the drag is in progress even if the cursor slips
    // off the (1-cell-wide) splitter.
    s.onMouseLeave?.({} as never);
    expect((s as unknown as { hovered: boolean }).hovered).toBe(true);
  });

  test("mouse-leave outside a drag clears the hover highlight", () => {
    const s = new SplitterWidget();
    s.onMouseEnter?.({} as never);
    expect((s as unknown as { hovered: boolean }).hovered).toBe(true);

    s.onMouseLeave?.({} as never);
    expect((s as unknown as { hovered: boolean }).hovered).toBe(false);
  });

  test("further mouse events are ignored once one has already been handled", () => {
    const s = new SplitterWidget();
    const deltas: number[] = [];
    s.onResize = (d) => deltas.push(d);

    s.handleMouse({ x: 10, y: 5, type: "press", button: "left", handled: true } as MouseEvent);
    // handled was already true, so the press is never processed: dragging
    // never starts, so this drag is ignored too.
    s.handleMouse(mouse(15, 5, "drag"));
    expect(deltas).toEqual([]);
  });

  test("a drag with zero net delta does not fire onResize", () => {
    const s = new SplitterWidget();
    const deltas: number[] = [];
    s.onResize = (d) => deltas.push(d);

    s.handleMouse(mouse(10, 5, "press"));
    s.handleMouse(mouse(10, 5, "drag")); // same position -> delta 0
    expect(deltas).toEqual([]);
  });

  test("thickens the glyph and resolves a literal accent color while active (hovered)", () => {
    // No App.instance is mounted, so the cssResolver calls short-circuit to
    // undefined and the widget must fall back to the literal accent colors.
    const s = new SplitterWidget();
    s.orientation = "vertical";
    s.region = new Region(new Offset(0, 0), new Size(1, 3));
    s.onMouseEnter?.({} as never);

    const buffer = new ScreenBuffer(1, 3);
    s.render(buffer);
    expect(buffer.cells[0][0].char).toBe("┃");
    expect(buffer.cells[0][0].style.color).toBe("#4daafc");
  });

  test("thickens the horizontal glyph while dragging", () => {
    const s = new SplitterWidget();
    s.orientation = "horizontal";
    s.region = new Region(new Offset(0, 0), new Size(3, 1));
    s.handleMouse(mouse(1, 0, "press")); // starts dragging

    const buffer = new ScreenBuffer(3, 1);
    s.render(buffer);
    expect(buffer.cells[0][0].char).toBe("━");
  });
});
