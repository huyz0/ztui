import { describe, expect, test, vi } from "vitest";
import { Box, Input, RichLog, RichText, VBox } from "../react/components.tsx";
import type { InputWidget } from "../widgets/controls/input.ts";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

/**
 * Drives the App's real mouse pipeline (hit-test → dispatch → focus/onClick/
 * scroll bubbling) through the injected driver, covering branches that only run
 * from genuine pointer events.
 */
describe("App mouse dispatch", () => {
  test("a left press focuses the hit widget and bubbles onClick to an ancestor handler", async () => {
    const onClick = vi.fn();
    const t = await mountApp(
      <Box id="card" onClick={onClick} focusable style={{ width: 20, height: 6 }}>
        <Box id="leaf" style={{ width: 4, height: 2 }} />
      </Box>,
    );
    await t.settle();
    t.driver.simulateMouse(1, 1, "press", "left");
    t.driver.simulateMouse(1, 1, "release", "left");
    await t.settle();
    expect(onClick).toHaveBeenCalled();
  });

  test("a press on a disabled widget is swallowed (no onClick)", async () => {
    const onClick = vi.fn();
    const t = await mountApp(
      <Box id="card" onClick={onClick} disabled style={{ width: 20, height: 6 }} />,
    );
    await t.settle();
    t.driver.simulateMouse(1, 1, "press", "left");
    await t.settle();
    expect(onClick).not.toHaveBeenCalled();
  });

  test("wheel events forward to a scrollable under the pointer", async () => {
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i}`);
    const t = await mountApp(<RichLog id="log" lines={lines} />);
    await t.settle();
    expect(t.text()).toContain("line 59"); // tailing at the bottom

    t.driver.simulateMouse(2, 2, "scroll_up", "none");
    t.driver.simulateMouse(2, 2, "scroll_up", "none");
    await t.settle();
    expect(t.text()).not.toContain("line 59"); // wheel scrolled up off the tail
  });

  test("a press that resolves to a clickable container still fires when it hits a leaf child", async () => {
    const onClick = vi.fn();
    const t = await mountApp(
      <Box id="card" onClick={onClick} style={{ width: 20, height: 6 }}>
        <VBox id="inner" style={{ width: 8, height: 3 }} />
      </Box>,
    );
    await t.settle();
    // Press lands on the inner child; onClick bubbles to the card ancestor.
    t.driver.simulateMouse(2, 1, "press", "left");
    t.driver.simulateMouse(2, 1, "release", "left");
    await t.settle();
    expect(onClick).toHaveBeenCalled();
  });
});

describe("App key dispatch", () => {
  test("Ctrl+C with a focused text selection copies instead of quitting", async () => {
    const t = await mountApp(<Input id="in" value="hello" />);
    await t.settle();
    const w = t.findById<InputWidget>("in") as InputWidget;
    t.screen.focusWidget(w);

    t.driver.simulateKey("ctrl+a", "a", true); // select all
    expect(w.hasSelection()).toBe(true);
    // Bare Ctrl+C with a live selection must copy (handled) and NOT exit.
    t.driver.simulateKey("ctrl+c", "c", true);
    await t.settle();
    expect(w.hasSelection()).toBe(true); // selection survives the copy
  });

  test("Ctrl+C with an active read-only (mouse) selection copies it, with no focused text widget involved", async () => {
    const t = await mountApp(<RichText id="rt">hello world</RichText>, { cols: 40, rows: 5 });
    await t.settle();
    const rt = t.findById<any>("rt");
    const r = rt.getContentRect();
    // Drag-select "hello" over the display widget — not a focusable text
    // control, so handleCtrlC's `focused?.copySelection?.()` path can't fire;
    // only the readonly `host.selection.active` branch can satisfy this.
    rt.handleMouse({ type: "press", button: "left", x: r.x, y: r.y });
    rt.handleMouse({ type: "drag", button: "left", x: r.x + 5, y: r.y });
    rt.handleMouse({ type: "release", button: "left", x: r.x + 5, y: r.y });
    expect(t.app.selection.active).not.toBeNull();

    await t.driver.clipboard.set(""); // clear what release's own auto-copy wrote
    t.driver.simulateKey("ctrl+c", "c", true);
    await t.settle();
    expect(await t.driver.clipboard.get()).toBe("hello");
  });

  test("a hotkey registered on ctrl+c fires instead of the built-in copy/quit behavior", async () => {
    // Regression: the hardcoded ctrl+c branch always ran (and returned) before
    // any hotkey dispatch at all, so a hotkey registered on "ctrl+c" could
    // never fire -- unlike every other key, which always gets a chance via
    // the priority-phase dispatch further down handleKey(). Guard process.exit
    // too: on the buggy code path this test would otherwise fall through to
    // the built-in quit behavior and kill the test worker outright.
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    const t = await mountApp(<Box id="card" style={{ width: 10, height: 4 }} />);
    await t.settle();
    const handler = vi.fn();
    const dispose = t.app.hotkeys.register({ key: "ctrl+c", name: "test-ctrl-c", handler });
    try {
      t.driver.simulateKey("ctrl+c", "c", true);
      await t.settle();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      dispose();
      exitSpy.mockRestore();
    }
  });

  test("a fallback hotkey registered on tab fires once the focused widget declines it", async () => {
    // Regression: the hardcoded tab branch always navigated focus (or handed
    // the key to a widget that opts into wantsTab) and returned, before the
    // fallback-phase hotkey dispatch ever ran -- so a hotkey registered on
    // "tab" could never fire.
    const t = await mountApp(<Box id="card" style={{ width: 10, height: 4 }} />);
    await t.settle();
    const handler = vi.fn();
    const dispose = t.app.hotkeys.register({ key: "tab", name: "test-tab", handler });
    try {
      t.driver.simulateKey("tab", "tab");
      await t.settle();
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      dispose();
    }
  });

  test("Escape clears a focused selection before anything else", async () => {
    const t = await mountApp(<Input id="in" value="world" />);
    await t.settle();
    const w = t.findById<InputWidget>("in") as InputWidget;
    t.screen.focusWidget(w);
    t.driver.simulateKey("ctrl+a", "a", true);
    expect(w.hasSelection()).toBe(true);

    t.driver.simulateKey("escape", "escape");
    await t.settle();
    expect(w.hasSelection()).toBe(false);
  });

  test("a translucent background blends over the theme surface without error", async () => {
    const t = await mountApp(
      <Box id="glass" style={{ background: "#ff000080", width: 12, height: 4 }} />,
    );
    await t.settle();
    // The translucent rgba is flattened to a concrete opaque colour (red blended
    // over the surface), never passed through with its alpha.
    const bg = t.cellAt(1, 1).style.background;
    expect(bg).toMatch(/^(#|rgb)/);
    expect(bg).not.toBe("#ff000080"); // alpha was resolved, not kept
  });

  test("Ctrl+V pastes bracketed text into the focused input", async () => {
    const t = await mountApp(<Input id="in" value="" />);
    await t.settle();
    const w = t.findById<InputWidget>("in") as InputWidget;
    t.screen.focusWidget(w);
    // A paste event delivers the payload as one insert.
    t.driver.emit("paste", "pasted");
    await t.settle();
    expect(w.value).toContain("pasted");
  });
});
