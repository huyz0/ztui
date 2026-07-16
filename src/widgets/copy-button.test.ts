import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../core/app.ts";
import { MockDriver } from "../driver/mock/index.ts";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { ScreenBuffer } from "../render/buffer.ts";
import { CopyButtonWidget } from "./copy-button.ts";

describe("CopyButtonWidget", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("clears its ack timer on unmount instead of letting it fire later", () => {
    // Regression: copy() sets `this.timer = setTimeout(...)` but nothing
    // cleared it when the widget unmounted. If the host removes the widget
    // before the ~1200ms ack window elapses, the timer callback still fired
    // and mutated `copied`/called queueRender() for a widget no longer in
    // the tree.
    vi.useFakeTimers();
    const driver = new MockDriver(40, 5);
    const app = new App(driver);
    app.run();

    const btn = new CopyButtonWidget();
    btn.getText = () => "hello";
    app.activeScreen.appendChild(btn);

    btn.onClick?.({} as never);
    expect((btn as unknown as { copied: boolean }).copied).toBe(true);

    // Widget is removed from the tree before the ack window elapses.
    app.activeScreen.removeChild(btn);
    btn.onUnmount();

    vi.advanceTimersByTime(2000);
    // Without the fix, the stale timer would have flipped `copied` back to
    // false by now; with the fix it never runs, so the flag is unchanged
    // (a moot point for a detached widget, but proves the timer didn't fire).
    expect((btn as unknown as { copied: boolean }).copied).toBe(true);

    app.stop();
  });

  test("render() is a no-op when the client rect is empty", () => {
    // Regression-style coverage for the early-return guard: an unlaid-out (or
    // zero-sized) widget has an empty region, so `getClientRect()` yields a
    // width/height of 0 and render() must bail before touching the buffer.
    const btn = new CopyButtonWidget();
    const buffer = new ScreenBuffer(4, 2);
    expect(() => btn.render(buffer)).not.toThrow();
    // Nothing painted: every cell stays the buffer's default blank char.
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 4; x++) {
        expect(buffer.cells[y]?.[x]?.char).not.toBe("⧉");
        expect(buffer.cells[y]?.[x]?.char).not.toBe("✓");
      }
    }
  });

  test("falls back to the raw variable token when the theme can't resolve it", () => {
    // With no App.instance running, `App.instance?.cssResolver...` short-circuits
    // to undefined, so `resolve()`'s `resolveVariable(...) || v` fallback must
    // return the raw token (e.g. "$dimmed") rather than throwing or blanking out.
    expect(App.instance).toBeFalsy();
    const btn = new CopyButtonWidget();
    btn.region = new Region(new Offset(0, 0), new Size(2, 1));
    const buffer = new ScreenBuffer(4, 2);
    expect(() => btn.render(buffer)).not.toThrow();
    expect(buffer.cells[0]?.[0]?.char).toBe("⧉");
  });
});
