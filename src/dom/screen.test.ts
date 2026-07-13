import { describe, expect, test } from "vitest";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
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
