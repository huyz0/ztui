import { useState } from "react";
import { afterEach, describe, expect, test } from "vitest";
import { App } from "../../core/app.ts";
import { unmount } from "../../react/reconciler.ts";
import { Button, Label, render, VBox } from "../../react.ts";
import { flush } from "../../test/harness.tsx";
import { attachToDOM, translateKeyboardEvent, translateMouseEvent } from "./dom.ts";
import { WebDriver } from "./index.ts";

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <VBox style={{ width: "100%", height: "100%" }}>
      <Label id="lbl">Count: {count}</Label>
      <Button id="btn" onClick={() => setCount((c) => c + 1)}>
        Increment
      </Button>
    </VBox>
  );
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups.splice(0)) fn();
});

/**
 * Poll `fn` until it returns truthy or the timeout elapses. React commits and
 * frame renders are async, so a fixed sleep is flaky under coverage
 * instrumentation — wait for the actual condition instead.
 */
async function waitFor<T>(fn: () => T | undefined, timeout = 1000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error("waitFor timed out");
    await flush(5);
  }
}

async function mountWeb(ui: React.ReactNode, cols = 160, rows = 44) {
  const driver = new WebDriver(cols, rows);
  const app = new App(driver);
  const container = render(ui, app.activeScreen);
  app.run();
  cleanups.push(() => {
    unmount(container);
    app.stop();
  });
  await waitFor(() => driver.toText().includes("Increment"));
  return { driver, app };
}

describe("WebDriver end-to-end", () => {
  test("presents the composed cell grid as frames (no ANSI needed)", async () => {
    const { driver } = await mountWeb(<Counter />);
    expect(driver.toText()).toContain("Count: 0");
    expect(driver.toText()).toContain("Increment");
    expect(driver.toHTML()).toContain("<span");
  });

  test("onFrame fires on changes and dispatched keys drive the app", async () => {
    const { driver } = await mountWeb(<Counter />);
    let frames = 0;
    driver.onFrame = () => frames++;

    // Tab focuses the button, Enter activates it.
    driver.dispatchKey({ key: "tab", name: "tab", ctrl: false, meta: false, shift: false });
    await flush();
    driver.dispatchKey({ key: "enter", name: "enter", ctrl: false, meta: false, shift: false });

    await waitFor(() => driver.toText().includes("Count: 1"));
    expect(frames).toBeGreaterThan(0);
  });

  test("dispatched mouse clicks hit-test in cell coordinates", async () => {
    const { driver, app } = await mountWeb(<Counter />);
    let btn: any;
    app.activeScreen.walk((n: any) => {
      if (n.id === "btn") btn = n;
    });
    const { x, y } = btn.region;
    driver.dispatchMouse({ x, y, type: "press", button: "left" });
    driver.dispatchMouse({ x, y, type: "release", button: "left" });
    await waitFor(() => driver.toText().includes("Count: 1"));
    expect(driver.toText()).toContain("Count: 1");
  });

  test("resize re-lays-out to the new grid", async () => {
    const { driver, app } = await mountWeb(<Counter />, 160, 44);
    driver.resize(200, 60);
    // resize is debounced 30ms in App, then re-lays-out asynchronously.
    await waitFor(() => app.buffer.width === 200);
    expect(app.buffer.width).toBe(200);
    expect(app.buffer.height).toBe(60);
    expect(driver.toText()).toContain("Count: 0");
  });

  test("clamps window size to the 120x50 minimum (browser has no TTY floor)", async () => {
    const driver = new WebDriver(10, 5); // below the floor
    expect(driver.getSize()).toMatchObject({ width: 120, height: 50 });
    driver.resize(40, 12); // still below the floor -> no change, no event
    let resized = false;
    driver.on("resize", () => {
      resized = true;
    });
    driver.resize(20, 8);
    expect(resized).toBe(false);
    expect(driver.getSize()).toMatchObject({ width: 120, height: 50 });
  });

  test("clipboard round-trips in memory without a browser", async () => {
    const driver = new WebDriver();
    driver.clipboard.set("hello web");
    expect(await driver.clipboard.get()).toBe("hello web");
  });
});

describe("DOM event translators", () => {
  test("named keys map to terminal key names", () => {
    expect(translateKeyboardEvent({ key: "ArrowDown" })).toMatchObject({ name: "down" });
    expect(translateKeyboardEvent({ key: "PageDown" })).toMatchObject({ name: "pagedown" });
    expect(translateKeyboardEvent({ key: "Enter", shiftKey: true })).toMatchObject({
      name: "enter",
      shift: true,
    });
  });

  test("printable keys pass through; ctrl combos get ctrl+ prefix", () => {
    expect(translateKeyboardEvent({ key: "a" })).toMatchObject({ key: "a", name: "a" });
    expect(translateKeyboardEvent({ key: "C", ctrlKey: true })).toMatchObject({
      key: "ctrl+c",
      ctrl: true,
    });
    // Plain space stays a literal character (text input); Ctrl+Space is named.
    expect(translateKeyboardEvent({ key: " " })).toMatchObject({ key: " ", name: " " });
    expect(translateKeyboardEvent({ key: " ", ctrlKey: true })).toMatchObject({ name: "space" });
  });

  test("meta and ctrl+shift combos embed a full modifier prefix", () => {
    expect(translateKeyboardEvent({ key: "z", metaKey: true })).toMatchObject({
      key: "meta+z",
      ctrl: false,
      meta: true,
    });
    expect(translateKeyboardEvent({ key: "Z", ctrlKey: true, shiftKey: true })).toMatchObject({
      key: "ctrl+shift+z",
      ctrl: true,
      shift: true,
    });
    expect(translateKeyboardEvent({ key: "Z", metaKey: true, shiftKey: true })).toMatchObject({
      key: "meta+shift+z",
      meta: true,
      shift: true,
    });
    // Alt is treated as meta.
    expect(translateKeyboardEvent({ key: " ", altKey: true })).toMatchObject({
      key: "meta+space",
      meta: true,
    });
    // Bare Shift+letter must stay the browser's own shifted char, not a "shift+" prefix.
    expect(translateKeyboardEvent({ key: "A", shiftKey: true })).toMatchObject({
      key: "A",
      shift: true,
    });
  });

  test("non-terminal keys return null", () => {
    expect(translateKeyboardEvent({ key: "F5" })).toBeNull();
    expect(translateKeyboardEvent({ key: "Shift" })).toBeNull();
  });

  test("mouse pixels map to cells with padding offset and clamping", () => {
    const metrics = { cellWidth: 8, cellHeight: 16, offsetX: 10, offsetY: 10 };
    expect(
      translateMouseEvent(
        { offsetX: 10 + 8 * 3, offsetY: 10 + 16 * 2, button: 0 },
        "press",
        metrics,
      ),
    ).toMatchObject({ x: 3, y: 2, type: "press", button: "left" });
    expect(
      translateMouseEvent({ offsetX: 0, offsetY: 0, button: 2 }, "press", metrics),
    ).toMatchObject({ x: 0, y: 0, button: "right" });
    expect(translateMouseEvent({ offsetX: 20, offsetY: 20 }, "scroll_down", metrics)).toMatchObject(
      { type: "scroll_down", button: "none" },
    );
  });

  test("a drag reports its actual held button, not always left", () => {
    // Regression: `mousemove`'s `event.button` is always 0 in every browser,
    // regardless of which button is actually held down. A "drag" translated
    // from `button` alone (as press/release correctly do) always reported
    // "left" even when the user was dragging with the right or middle button.
    const metrics = { cellWidth: 8, cellHeight: 16 };
    // button: 0 (always, per the DOM spec) but buttons: 2 means the right
    // button is the one actually held during this drag.
    expect(
      translateMouseEvent({ offsetX: 0, offsetY: 0, button: 0, buttons: 2 }, "drag", metrics),
    ).toMatchObject({ button: "right" });
    expect(
      translateMouseEvent({ offsetX: 0, offsetY: 0, button: 0, buttons: 4 }, "drag", metrics),
    ).toMatchObject({ button: "middle" });
    expect(
      translateMouseEvent({ offsetX: 0, offsetY: 0, button: 0, buttons: 1 }, "drag", metrics),
    ).toMatchObject({ button: "left" });
  });

  test("mouse pixels are clamped to the driver's column/row bounds when given", () => {
    // Regression: only the lower bound (Math.max(0, x)) was ever clamped — a
    // host element with padding/border wider than an exact multiple of the
    // cell size could report coordinates past the last visible column/row,
    // which widgets don't expect (they assume x < cols, y < rows).
    const metrics = { cellWidth: 8, cellHeight: 16 };
    const bounds = { cols: 10, rows: 5 };
    // Pixel position lands one full cell past the last valid column/row.
    expect(
      translateMouseEvent({ offsetX: 8 * 12, offsetY: 16 * 7 }, "press", metrics, bounds),
    ).toMatchObject({ x: 9, y: 4 }); // clamped to cols-1 / rows-1
    // In-bounds coordinates pass through unchanged.
    expect(
      translateMouseEvent({ offsetX: 8 * 3, offsetY: 16 * 2 }, "press", metrics, bounds),
    ).toMatchObject({ x: 3, y: 2 });
  });

  function fakeHost(): HTMLElement {
    const listeners = new Map<string, Set<(ev: unknown) => void>>();
    return {
      tabIndex: -1,
      addEventListener: (type: string, fn: (ev: unknown) => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)?.add(fn);
      },
      removeEventListener: (type: string, fn: (ev: unknown) => void) => {
        listeners.get(type)?.delete(fn);
      },
    } as unknown as HTMLElement;
  }

  test("attachToDOM throws on a second attach without detaching first", () => {
    const host = fakeHost();
    const driver = new WebDriver();
    const detach = attachToDOM(driver, host, { metrics: { cellWidth: 8, cellHeight: 16 } });
    expect(() => attachToDOM(driver, host, { metrics: { cellWidth: 8, cellHeight: 16 } })).toThrow(
      /already attached/,
    );
    detach();
    // After detaching, re-attaching the same host is fine.
    expect(() =>
      attachToDOM(driver, host, { metrics: { cellWidth: 8, cellHeight: 16 } }),
    ).not.toThrow();
  });
});
