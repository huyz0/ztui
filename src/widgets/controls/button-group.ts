import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import { ButtonWidget } from "./button.ts";

/**
 * A roving-focus toolbar around `Button` children: arrow keys move focus between
 * the buttons and the group is a single Tab stop, so a row of actions reads as
 * one control. The mechanism mirrors `RadioGroupWidget` (one active item, arrows
 * navigate) but over *real* focusable `Button` widgets, so each button keeps its
 * own activation, focus glow, and `formAction` (Enter/Space and clicks are
 * handled natively by the button — the group only owns navigation).
 *
 * - Single Tab stop: every frame, only the active button is left `focusable`, so
 *   the screen's tab order has one entry for the group; Tab leaves it.
 * - Arrows: `←`/`↑` previous, `→`/`↓` next (both axes, like a radio group);
 *   `Home`/`End` jump to the ends; disabled buttons are skipped. These arrive by
 *   bubbling from the focused child (whose own `handleKey` ignores them).
 */
export class ButtonGroupWidget extends Widget {
  /** Layout direction of the buttons. Default `"horizontal"`. */
  public orientation: "horizontal" | "vertical" = "horizontal";
  /** Wrap around at the ends instead of stopping. Default `true`. */
  public wrap = true;

  /** Index into the *enabled* buttons that currently holds focus. */
  private activeIndex = 0;

  constructor() {
    super("button-group");
    // The group is a container, not a focus target itself — the active child is.
    this.focusable = false;
    // A press on a child button bubbles here (buttons define no `onMouseDown`),
    // so clicking any button — even one that isn't the current tab stop — makes
    // it the active button and moves focus to it. The button's own `onClick` /
    // `formAction` still fire from its `handleMouse`.
    this.onMouseDown = (ev: any) => {
      const btns = this.enabledButtons();
      const idx = btns.findIndex((b) => b.region.contains(ev.x, ev.y));
      if (idx < 0) return;
      this.focusActive(btns, idx);
    };
  }

  /** Make button `idx` the active tab stop and focus it. */
  private focusActive(btns: ButtonWidget[], idx: number): void {
    this.activeIndex = idx;
    for (let i = 0; i < btns.length; i++) btns[i].focusable = i === idx;
    App.instance?.activeScreen?.focusWidget(btns[idx]);
  }

  /** The enabled, visible `Button` children, in order. */
  private enabledButtons(): ButtonWidget[] {
    return this.children.filter(
      (c): c is ButtonWidget => c instanceof ButtonWidget && c.visible && !c.isDisabled(),
    );
  }

  /** Leave only the active button in the tab order, so the group is one Tab stop. */
  private syncTabStop(): void {
    const btns = this.enabledButtons();
    if (btns.length === 0) return;
    const screen = App.instance?.activeScreen;
    // If a button in the group is focused (Tab landed here, or a click focused
    // it), adopt it as active so the state follows real focus.
    const focused = screen?.focusedWidget;
    const focusedIdx = focused ? btns.indexOf(focused as ButtonWidget) : -1;
    if (focusedIdx >= 0) this.activeIndex = focusedIdx;
    this.activeIndex = Math.max(0, Math.min(btns.length - 1, this.activeIndex));
    for (let i = 0; i < btns.length; i++) btns[i].focusable = i === this.activeIndex;
  }

  public override measure(maxW: number, maxH: number): void {
    this.syncTabStop();
    super.measure(maxW, maxH);
  }

  public override handleKey(ev: any): void {
    const k = ev.name || ev.key;
    if (
      k !== "left" &&
      k !== "right" &&
      k !== "up" &&
      k !== "down" &&
      k !== "home" &&
      k !== "end"
    ) {
      return; // not ours — let it keep bubbling (global hotkeys, etc.)
    }
    const btns = this.enabledButtons();
    if (btns.length === 0) return;

    let idx = btns.findIndex((b) => b.focused);
    if (idx < 0) idx = this.activeIndex;

    let next = idx;
    if (k === "home") next = 0;
    else if (k === "end") next = btns.length - 1;
    else if (k === "left" || k === "up") next = idx - 1;
    else next = idx + 1; // right / down

    if (next < 0 || next >= btns.length) {
      if (!this.wrap) {
        ev.handled = true; // consume at the boundary; focus stays put
        return;
      }
      next = (next + btns.length) % btns.length;
    }

    this.focusActive(btns, next);
    ev.handled = true;
  }
}
