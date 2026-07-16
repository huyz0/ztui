import { afterEach, describe, expect, test } from "vitest";
import { motion } from "../anim/motion.ts";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { ScreenBuffer } from "../render/buffer.ts";
import { ScrollableBoxWidget } from "../widgets/layout/box.ts";
import { OverlayRootWidget } from "./overlay.ts";
import { Screen, type ScreenLayer } from "./screen.ts";
import { Widget } from "./widget.ts";

function makeLayer(modal: boolean): ScreenLayer {
  return {
    root: new OverlayRootWidget(),
    modal,
    closeOnEscape: true,
    closeOnOutsideClick: true,
  };
}

describe("Screen.pushLayer / removeLayer focus restore", () => {
  test("removing a modal restores focus to the previously-focused widget", () => {
    const screen = new Screen();
    screen.region = new Region(Offset.ORIGIN, new Size(20, 10));
    const trigger = new Widget("button");
    trigger.focusable = true;
    screen.appendChild(trigger);
    screen.focusWidget(trigger);

    const layer = makeLayer(true);
    screen.pushLayer(layer);
    expect(screen.focusedWidget).not.toBe(trigger);

    screen.removeLayer(layer.root);
    expect(screen.focusedWidget).toBe(trigger);
  });

  test("removing a modal does not restore focus to a widget that unmounted while it was open", () => {
    const screen = new Screen();
    screen.region = new Region(Offset.ORIGIN, new Size(20, 10));
    const trigger = new Widget("button");
    trigger.focusable = true;
    screen.appendChild(trigger);
    screen.focusWidget(trigger);

    const layer = makeLayer(true);
    screen.pushLayer(layer);
    screen.removeChild(trigger); // unmounted while the modal was open

    screen.removeLayer(layer.root);
    expect(screen.focusedWidget).toBeNull();
  });

  test("removing a modal does not restore focus to a widget now attached to a different screen", () => {
    // Regression: the restore check only verified `prev.parent` was non-null,
    // not that `prev` was actually reachable from *this* screen. A widget
    // moved to another screen (e.g. across a pushScreen/popScreen while the
    // modal was still open on the original one) still has a non-null parent
    // — just the wrong one — and could silently regain focus on a screen
    // it's no longer part of.
    const screenA = new Screen();
    screenA.region = new Region(Offset.ORIGIN, new Size(20, 10));
    const trigger = new Widget("button");
    trigger.focusable = true;
    screenA.appendChild(trigger);
    screenA.focusWidget(trigger);

    const layer = makeLayer(true);
    screenA.pushLayer(layer);

    // The widget moves to a different screen while the modal is still open.
    const screenB = new Screen();
    screenB.region = new Region(Offset.ORIGIN, new Size(20, 10));
    screenA.removeChild(trigger);
    screenB.appendChild(trigger);

    screenA.removeLayer(layer.root);
    expect(screenA.focusedWidget).toBeNull();
  });

  test("removing a non-modal layer never touches focus", () => {
    const screen = new Screen();
    screen.region = new Region(Offset.ORIGIN, new Size(20, 10));
    const trigger = new Widget("button");
    trigger.focusable = true;
    screen.appendChild(trigger);
    screen.focusWidget(trigger);

    const layer = makeLayer(false);
    screen.pushLayer(layer);
    expect(screen.focusedWidget).toBe(trigger); // non-modal never steals focus

    screen.removeLayer(layer.root);
    expect(screen.focusedWidget).toBe(trigger);
  });
});

describe("Screen misc branches", () => {
  afterEach(() => {
    motion.reset();
  });

  test("removeOverlay is a no-op when the widget was never added", () => {
    const screen = new Screen();
    const widget = new Widget("stray");
    expect(() => screen.removeOverlay(widget)).not.toThrow();
  });

  test("removeLayer is a no-op when the root isn't a tracked layer", () => {
    const screen = new Screen();
    const stray = new OverlayRootWidget();
    expect(() => screen.removeLayer(stray)).not.toThrow();
  });

  test("render schedules an ambient focus tick when motion is enabled and a widget is focused", () => {
    motion.set(true);
    const screen = new Screen();
    screen.region = new Region(Offset.ORIGIN, new Size(20, 10));
    const trigger = new Widget("button");
    trigger.focusable = true;
    screen.appendChild(trigger);
    screen.focusWidget(trigger);

    const buffer = new ScreenBuffer(20, 10);
    expect(() => screen.render(buffer)).not.toThrow();
  });

  test("toAccessibleText includes stacked layers", () => {
    const screen = new Screen();
    screen.region = new Region(Offset.ORIGIN, new Size(20, 10));

    const modalLayer = makeLayer(true);
    screen.pushLayer(modalLayer);
    const nonModalLayer = makeLayer(false);
    screen.pushLayer(nonModalLayer);

    const text = screen.toAccessibleText();
    expect(text).toContain("[modal]");
    expect(text).toContain("[layer]");
  });

  test("focusNext is a no-op when there are no focusable widgets", () => {
    const screen = new Screen();
    screen.region = new Region(Offset.ORIGIN, new Size(20, 10));
    expect(() => screen.focusNext()).not.toThrow();
    expect(screen.focusedWidget).toBeNull();
  });

  test("scrollIntoView scrolls a horizontally-scrollable-only ancestor into view", () => {
    const screen = new Screen();
    screen.region = new Region(Offset.ORIGIN, new Size(20, 10));

    const box = new ScrollableBoxWidget();
    box.style = { width: 6, height: 4, overflowX: "scroll", overflowY: "hidden" };
    box.region = new Region(Offset.ORIGIN, new Size(6, 4));

    const child = new Widget("child");
    child.focusable = true;
    child.region = new Region(new Offset(20, 0), new Size(2, 2));
    box.appendChild(child);
    screen.appendChild(box);

    screen.focusWidget(child);
    expect(box.scrollOffset.x).toBeGreaterThan(0);
    expect(box.scrollOffset.y).toBe(0);
  });

  test("scrollIntoView scrolls a vertically-scrollable-only ancestor into view", () => {
    const screen = new Screen();
    screen.region = new Region(Offset.ORIGIN, new Size(20, 10));

    const box = new ScrollableBoxWidget();
    box.style = { width: 6, height: 4, overflowX: "hidden", overflowY: "scroll" };
    box.region = new Region(Offset.ORIGIN, new Size(6, 4));

    const child = new Widget("child");
    child.focusable = true;
    child.region = new Region(new Offset(0, 20), new Size(2, 2));
    box.appendChild(child);
    screen.appendChild(box);

    screen.focusWidget(child);
    expect(box.scrollOffset.y).toBeGreaterThan(0);
    expect(box.scrollOffset.x).toBe(0);
  });

  test("scrollIntoView scrolls up/left when the focused child sits above/before the viewport", () => {
    const screen = new Screen();
    screen.region = new Region(Offset.ORIGIN, new Size(20, 10));

    const box = new ScrollableBoxWidget();
    box.style = { width: 6, height: 4, overflowX: "scroll", overflowY: "scroll" };
    box.region = new Region(Offset.ORIGIN, new Size(6, 4));
    box.scrollOffset = new Offset(10, 10);

    const child = new Widget("child");
    child.focusable = true;
    // Unscrolled position (region + scrollOffset) still falls before the
    // viewport's top-left, so scrollIntoView should scroll up and left.
    child.region = new Region(new Offset(-3, -3), new Size(2, 2));
    box.appendChild(child);
    screen.appendChild(box);

    screen.focusWidget(child);
    expect(box.scrollOffset.x).toBeLessThan(10);
    expect(box.scrollOffset.y).toBeLessThan(10);
  });

  test("scrollIntoView is a no-op when the focused child is already fully visible", () => {
    const screen = new Screen();
    screen.region = new Region(Offset.ORIGIN, new Size(20, 10));

    const box = new ScrollableBoxWidget();
    box.style = { width: 6, height: 4, overflowX: "scroll", overflowY: "scroll" };
    box.region = new Region(Offset.ORIGIN, new Size(6, 4));

    const child = new Widget("child");
    child.focusable = true;
    child.region = new Region(new Offset(0, 0), new Size(2, 2));
    box.appendChild(child);
    screen.appendChild(box);

    screen.focusWidget(child);
    expect(box.scrollOffset.x).toBe(0);
    expect(box.scrollOffset.y).toBe(0);
  });
});
