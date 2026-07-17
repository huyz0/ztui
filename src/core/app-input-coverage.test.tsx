import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Box, Dialog, Input, RichLog, StickyPanel, VBox } from "../react.ts";
import { flush, mountApp } from "../test/harness.tsx";
import { logger } from "../utils/logger.ts";
import type { InputWidget } from "../widgets/controls/input.ts";

describe("AppInput: debug logging", () => {
  let logDir: string;
  let logFile: string;

  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), "ztui-app-input-"));
    logFile = join(logDir, "ztui.log");
    logger.configure({ filePath: logFile, level: "debug" });
  });

  afterEach(() => {
    logger.reset();
    rmSync(logDir, { recursive: true, force: true });
  });

  test("an unhandled key logs the string-form 'ignored' message", async () => {
    const t = await mountApp(<Box id="b" style={{ width: 10, height: 4 }} />, {
      cols: 20,
      rows: 6,
    });
    await t.settle();
    t.driver.simulateKey("z", "z", false);
    await t.settle();
    expect(readFileSync(logFile, "utf8")).toContain("ignored (no widget in the focused chain");
  });

  test("Tab navigation logs the function-form 'focus moved to' message", async () => {
    const t = await mountApp(
      <VBox>
        <Box id="a" focusable style={{ width: 5, height: 2 }} />
        <Box id="b" focusable style={{ width: 5, height: 2 }} />
      </VBox>,
      { cols: 20, rows: 6 },
    );
    await t.settle();
    t.screen.focusWidget(t.findById("a")!);
    t.driver.simulateKey("tab", "tab", false);
    await t.settle();
    expect(readFileSync(logFile, "utf8")).toContain("Focus moved to:");
  });

  test("Tab with no focusable widget at all logs '(none)'", async () => {
    const t = await mountApp(<Box id="b" style={{ width: 5, height: 2 }} />, {
      cols: 20,
      rows: 6,
    });
    await t.settle();
    expect(t.screen.focusedWidget).toBeNull();
    t.driver.simulateKey("tab", "tab", false);
    await t.settle();
    expect(t.screen.focusedWidget).toBeNull();
    expect(readFileSync(logFile, "utf8")).toContain("Focus moved to: (none)");
  });

  test("a mouse press logs the hit widget's description, or 'none' when it misses everything", async () => {
    // A press (not a "move") always reaches processMouse's log call — moves are
    // additionally gated by shouldSkipUninterestingMove, which would otherwise
    // return before ever building this message for a widget with no hover
    // interest.
    const t = await mountApp(<Box id="b" style={{ width: 5, height: 2 }} />, {
      cols: 20,
      rows: 6,
    });
    await t.settle();
    t.driver.simulateMouse(1, 1, "press", "left"); // hits "b"
    t.driver.simulateMouse(1, 1, "release", "left");
    // Off the edge of the screen buffer entirely: hitTest finds nothing.
    t.driver.simulateMouse(99, 99, "press", "left");
    t.driver.simulateMouse(99, 99, "release", "left");
    await t.settle();
    const contents = readFileSync(logFile, "utf8");
    expect(contents).toMatch(/Mouse press @ \(1,1\).*-> hit: (?!none)\S/);
    expect(contents).toContain("-> hit: none");
  });
});

describe("AppInput: safeInvoke error path with a string label", () => {
  test("a keyInterceptor that throws is caught and logged, not propagated", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    const t = await mountApp(
      <StickyPanel
        open
        panelStyle={{ left: 0, top: 0, width: 10 }}
        onKeyIntercept={() => {
          throw new Error("boom");
        }}
      >
        <Box style={{ width: 5, height: 2 }} />
      </StickyPanel>,
      { cols: 20, rows: 6 },
    );
    await t.settle();
    expect(() => t.driver.simulateKey("x", "x", false)).not.toThrow();
    await t.settle();
    expect(errorSpy).toHaveBeenCalled();
    const [, msg] = errorSpy.mock.calls[0];
    expect(String(msg)).toContain("keyInterceptor on layer");
    errorSpy.mockRestore();
  });
});

describe("AppInput: escape key edge cases", () => {
  test("Escape clears an active read-only (mouse) selection when nothing is focused", async () => {
    const t = await mountApp(<RichLog id="log" lines={["hello world"]} />, {
      cols: 40,
      rows: 5,
    });
    await t.settle();
    // Fabricate an active readonly selection directly (the mechanics of
    // building one via drag are covered elsewhere) to isolate this branch.
    t.app.selection.active = { anchor: { x: 0, y: 0 }, caret: { x: 1, y: 0 } } as any;
    t.driver.simulateKey("escape", "escape", false);
    await t.settle();
    expect(t.app.selection.active).toBeNull();
  });

  test("Escape does not close a layer with closeOnEscape={false}, and no keyInterceptor is a no-op pass-through", async () => {
    const onClose = vi.fn();
    const t = await mountApp(
      <StickyPanel open closeOnEscape={false} onClose={onClose} panelStyle={{ width: 10 }}>
        <Box style={{ width: 5, height: 2 }} />
      </StickyPanel>,
      { cols: 20, rows: 6 },
    );
    await t.settle();
    t.driver.simulateKey("escape", "escape", false);
    await t.settle();
    expect(onClose).not.toHaveBeenCalled();
    expect(t.screen.layers.length).toBe(1); // the panel is still open
  });
});

describe("AppInput: mouse edge cases", () => {
  test("a repeated move in the same cell is skipped (no duplicate hit-test/processing)", async () => {
    const t = await mountApp(<Box style={{ width: "100%", height: "100%" }} />, {
      cols: 20,
      rows: 6,
    });
    await t.settle();
    const diagsBefore = t.app.input.getDiagnostics().sameCellSkipped;
    // First move to (2,2) is throttled-immediate and actually processed
    // (setting lastMouseX/Y); wait out the throttle window so the second,
    // identical move is processed too rather than merely coalesced away —
    // only then does it reach shouldSkipDuplicateMove and get counted.
    t.driver.simulateMouse(2, 2, "move", "none");
    await t.settle(80);
    t.driver.simulateMouse(2, 2, "move", "none");
    await t.settle(80);
    expect(t.app.input.getDiagnostics().sameCellSkipped).toBe(diagsBefore + 1);
  });

  test("a click that misses every widget is a no-op (no hit widget to dispatch to)", async () => {
    const t = await mountApp(<Box id="b" style={{ width: 5, height: 2 }} />, {
      cols: 20,
      rows: 6,
    });
    await t.settle();
    expect(() => t.driver.simulateMouse(19, 5, "press", "left")).not.toThrow();
  });

  test("clicking a modal's backdrop with closeOnOutsideClick={false} consumes the click but does not close it", async () => {
    const onClose = vi.fn();
    const t = await mountApp(
      <Dialog open closeOnOutsideClick={false} onClose={onClose}>
        <Box id="inner" style={{ width: 5, height: 2 }} />
      </Dialog>,
      { cols: 20, rows: 10 },
    );
    await t.settle();
    // Click somewhere on the dimmed backdrop, well outside the dialog panel.
    t.driver.simulateMouse(1, 1, "press", "left");
    await t.settle();
    expect(onClose).not.toHaveBeenCalled();
    expect(t.screen.layers.length).toBe(1); // still open
  });

  test("a widget that detaches itself in onMouseDown leaves no stale activeDragWidget for the next drag/release", async () => {
    // Regression: resolveMouseHit pins `hit` back to `activeDragWidget` on
    // every drag/release without checking it's still attached. The modal
    // outside-click path clears it explicitly on dismiss, but any other
    // widget whose own press handler detaches it (or an ancestor) mid-dispatch
    // hit the same stale-widget reuse with no such guard.
    function App() {
      const [show, setShow] = useState(true);
      return (
        <Box style={{ width: 20, height: 10 }}>
          {show && (
            <Box id="target" style={{ width: 5, height: 2 }} onMouseDown={() => setShow(false)} />
          )}
        </Box>
      );
    }
    const t = await mountApp(<App />, { cols: 20, rows: 10 });
    const target = t.findById("target")!;
    t.driver.simulateMouse(1, 1, "press", "left");
    await t.settle();
    expect(t.findById("target")).toBeUndefined(); // detached from tree now

    expect(() => t.driver.simulateMouse(2, 1, "drag", "left")).not.toThrow();
    await t.settle();

    const input = (t.app.input as unknown as { activeDragWidget: unknown }).activeDragWidget;
    expect(input).not.toBe(target);
    expect(input).toBeNull();
  });
});

describe("AppInput: paste edge cases", () => {
  test("bracketed paste with no focused widget is a no-op", async () => {
    const t = await mountApp(<Box style={{ width: 10, height: 4 }} />, { cols: 20, rows: 6 });
    await t.settle();
    expect(() => t.app.input.handlePaste("hello")).not.toThrow();
  });

  test("Ctrl+V with an empty system clipboard inserts nothing", async () => {
    const t = await mountApp(<Input id="in" />, { cols: 20, rows: 6 });
    await t.settle();
    const w = t.findById<InputWidget>("in") as InputWidget;
    t.screen.focusWidget(w);
    await t.driver.clipboard.set("");

    t.driver.simulateKey("ctrl+v", "v", true);
    await flush();
    await Promise.resolve(); // let the clipboard.get() microtask settle
    await flush();

    expect(w.value).toBe("");
  });
});
