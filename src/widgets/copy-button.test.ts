import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../core/app.ts";
import { MockDriver } from "../driver/mock/index.ts";
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
});
