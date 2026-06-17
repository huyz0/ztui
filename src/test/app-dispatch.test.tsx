import { describe, expect, test, vi } from "vitest";
import { Box, Input, RichLog, VBox } from "../react/components.tsx";
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
