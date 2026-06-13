import { describe, expect, test, vi } from "vitest";
import { Input, TextArea } from "../react.ts";
import { flush, mountApp } from "./harness.tsx";

const ctrlC = { key: "ctrl+c", name: "c", ctrl: true, meta: false, shift: false };

/**
 * App-level routing of clipboard shortcuts and bracketed-paste events to the
 * focused text widget. Copy/cut use Ctrl+Shift+C/X (key "ctrl+C"/"ctrl+X" with
 * shift, as decoded under the Kitty keyboard protocol); paste/select-all use
 * Ctrl+V / Ctrl+A. Plain Ctrl+C is selection-aware — it copies when a selection
 * exists and quits otherwise; the quit-path tests mock `process.exit` so they
 * don't tear down the runner.
 */
describe("App — clipboard key routing", () => {
  test("Ctrl+Shift+C copies the focused input's selection without quitting", async () => {
    const { findById, screen, driver } = await mountApp(<Input id="in" />, {
      cols: 40,
      rows: 5,
    });
    const input = findById("in");
    input.value = "hello";
    screen.focusWidget(input);

    // Build a selection: shift+left twice selects "lo".
    driver.emit("key", { key: "left", name: "left", ctrl: false, meta: false, shift: true });
    driver.emit("key", { key: "left", name: "left", ctrl: false, meta: false, shift: true });

    driver.emit("key", { key: "ctrl+C", name: "c", ctrl: true, meta: false, shift: true });

    expect(await driver.clipboard.get()).toBe("lo");
    // Still alive (no exit) and value unchanged by a copy.
    expect(input.value).toBe("hello");
  });

  test("Ctrl+Shift+X cuts the selection from a textarea", async () => {
    const { findById, screen, driver } = await mountApp(<TextArea id="ta" value="abcdef" />, {
      cols: 40,
      rows: 6,
    });
    const ta = findById("ta");
    screen.focusWidget(ta);
    ta.cursorRow = 0;
    ta.cursorCol = 0;
    driver.emit("key", { key: "right", name: "right", ctrl: false, meta: false, shift: true });
    driver.emit("key", { key: "right", name: "right", ctrl: false, meta: false, shift: true });
    driver.emit("key", { key: "right", name: "right", ctrl: false, meta: false, shift: true });

    driver.emit("key", { key: "ctrl+X", name: "x", ctrl: true, meta: false, shift: true });

    expect(await driver.clipboard.get()).toBe("abc");
    expect(ta.value).toBe("def");
  });

  test("Ctrl+A selects all so a following copy grabs everything", async () => {
    const { findById, screen, driver } = await mountApp(<Input id="in" />, {
      cols: 40,
      rows: 5,
    });
    const input = findById("in");
    input.value = "select me";
    screen.focusWidget(input);

    driver.emit("key", { key: "ctrl+a", name: "a", ctrl: true, meta: false, shift: false });
    driver.emit("key", { key: "ctrl+C", name: "c", ctrl: true, meta: false, shift: true });

    expect(await driver.clipboard.get()).toBe("select me");
  });

  test("Ctrl+V pastes the framework clipboard into the input", async () => {
    const { findById, screen, driver } = await mountApp(<Input id="in" />, {
      cols: 40,
      rows: 5,
    });
    const input = findById("in");
    input.value = "ab";
    screen.focusWidget(input);
    driver.clipboard.set("XY");

    driver.emit("key", { key: "ctrl+v", name: "v", ctrl: true, meta: false, shift: false });
    await flush(10); // clipboard.get() resolves asynchronously

    expect(input.value).toBe("abXY");
  });

  test("plain Ctrl+C copies the selection (and does not quit) when one exists", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    try {
      const { findById, screen, driver } = await mountApp(<Input id="in" />, {
        cols: 40,
        rows: 5,
      });
      const input = findById("in");
      input.value = "hello";
      screen.focusWidget(input);
      driver.emit("key", { key: "left", name: "left", ctrl: false, meta: false, shift: true });
      driver.emit("key", { key: "left", name: "left", ctrl: false, meta: false, shift: true });

      driver.emit("key", { ...ctrlC });

      expect(await driver.clipboard.get()).toBe("lo");
      expect(exitSpy).not.toHaveBeenCalled();
      // The selection survives the copy (standard editor behavior), so another
      // Ctrl+C copies again rather than quitting; value untouched throughout.
      expect(input.value).toBe("hello");
      expect(input.hasSelection()).toBe(true);
      driver.emit("key", { ...ctrlC });
      expect(exitSpy).not.toHaveBeenCalled();

      // Escape deselects; only then does Ctrl+C quit.
      driver.emit("key", { key: "escape", name: "escape", ctrl: false, meta: false, shift: false });
      expect(input.hasSelection()).toBe(false);
      driver.emit("key", { ...ctrlC });
      expect(exitSpy).toHaveBeenCalled();
    } finally {
      exitSpy.mockRestore();
    }
  });

  test("plain Ctrl+C with no selection quits", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    try {
      const { findById, screen, driver } = await mountApp(<Input id="in" value="hi" />, {
        cols: 40,
        rows: 5,
      });
      screen.focusWidget(findById("in") ?? null);
      driver.emit("key", { ...ctrlC });
      expect(exitSpy).toHaveBeenCalled();
    } finally {
      exitSpy.mockRestore();
    }
  });

  test("on a backend that doesn't own the process (web), Ctrl+C never quits", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    try {
      const { findById, screen, driver } = await mountApp(<Input id="in" value="hi" />, {
        cols: 40,
        rows: 5,
        capabilities: { ownsProcess: false },
      });
      const input = findById("in");
      screen.focusWidget(input);
      // No selection: a terminal would quit here, but the web backend must not.
      driver.emit("key", { ...ctrlC });
      expect(exitSpy).not.toHaveBeenCalled();
      expect(input.value).toBe("hi");
    } finally {
      exitSpy.mockRestore();
    }
  });

  test("a bracketed-paste event inserts into the focused textarea", async () => {
    const { findById, screen, driver } = await mountApp(<TextArea id="ta" value="" />, {
      cols: 40,
      rows: 6,
    });
    const ta = findById("ta");
    screen.focusWidget(ta);

    driver.emit("paste", "one\ntwo");
    expect(ta.value).toBe("one\ntwo");
  });

  test("a bracketed-paste with bare CR newlines stays multi-line", async () => {
    const { findById, screen, driver } = await mountApp(<TextArea id="ta" value="" />, {
      cols: 40,
      rows: 6,
    });
    const ta = findById("ta");
    screen.focusWidget(ta);

    // Native terminal paste commonly sends \r between lines.
    driver.emit("paste", "one\rtwo\rthree");
    expect(ta.value).toBe("one\ntwo\nthree");
  });

  test("copy then Ctrl+V round-trips a multi-line selection intact", async () => {
    const { findById, screen, driver } = await mountApp(<TextArea id="ta" value={"aa\nbb\ncc"} />, {
      cols: 40,
      rows: 8,
    });
    const ta = findById("ta");
    screen.focusWidget(ta);
    ta.selectAll();
    ta.copySelection(); // writes the framework clipboard
    ta.value = ""; // clear, then paste it back
    screen.focusWidget(ta);

    driver.emit("key", { key: "ctrl+v", name: "v", ctrl: true, meta: false, shift: false });
    await flush(10);

    expect(ta.value).toBe("aa\nbb\ncc");
  });
});
