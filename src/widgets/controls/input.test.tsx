import { describe, expect, test } from "vitest";
import { Input } from "../../react.ts";
import { iconRegistry } from "../../render/icon-registry.ts";
import { mountApp } from "../../test/harness.tsx";
import { InputWidget } from "./input.ts";

describe("InputWidget — icon rendering", () => {
  test("renders a registered prefix icon and a plain-glyph suffix icon", async () => {
    iconRegistry.registerIcon({ name: "in-search", svg: "<svg/>", textFallback: "S" });
    const t = await mountApp(<Input id="in" value="hi" icon="in-search" suffixIcon="✕" />, {
      cols: 30,
      rows: 3,
    });
    await t.settle();
    // Prefix cell carries the registered icon; suffix is the plain glyph.
    expect(t.cellAt(1, 1).icon).toBe("in-search");
    expect(t.text()).toContain("✕");
  });

  test("renders a single-width emoji-free prefix icon (non-registered path)", async () => {
    const t = await mountApp(<Input id="in" value="x" icon=">" />, { cols: 20, rows: 3 });
    await t.settle();
    expect(t.text()).toContain(">");
  });

  test("password type masks the value with bullets", async () => {
    const t = await mountApp(<Input id="in" value="secret" type="password" />, {
      cols: 20,
      rows: 3,
    });
    await t.settle();
    expect(t.text()).not.toContain("secret");
    expect(t.text()).toContain("•");
  });
});

describe("InputWidget — accessors", () => {
  test("invalid override, validators/validateOn forwarding, and caret flags", () => {
    const w = new InputWidget();
    expect(w.invalid).toBe(false);
    w.invalid = true;
    expect(w.invalid).toBe(true);
    w.invalid = undefined; // defers to validation result
    expect(w.invalid).toBe(false);

    w.validators = [() => "bad"];
    expect(w.validators).toHaveLength(1);
    w.validateOn = "blur";
    expect(w.validateOn).toBe("blur");

    w.smoothCaret = false;
    expect(w.smoothCaret).toBe(false);
    expect(typeof w.cursorVisible).toBe("boolean");
    expect(w.getValidationValue()).toBe(w.value);
  });
});

describe("InputWidget — unicode input", () => {
  test("inserts a single ascii character", () => {
    const w = new InputWidget();
    w.onKey?.({ key: "a" } as any);
    expect(w.value).toBe("a");
  });

  test("inserts an astral glyph (emoji) as one character", () => {
    const w = new InputWidget();
    w.onKey?.({ key: "😀" } as any);
    expect(w.value).toBe("😀");
    // cursor advanced by a single code point, not two UTF-16 units
    w.onKey?.({ key: "x" } as any);
    expect(w.value).toBe("😀x");
  });

  test("ignores named keys", () => {
    const w = new InputWidget();
    w.onKey?.({ key: "up" } as any);
    w.onKey?.({ key: "enter" } as any);
    expect(w.value).toBe("");
  });
});

describe("InputWidget — selection & clipboard", () => {
  const press = (w: InputWidget, ev: Record<string, unknown>) => w.onKey?.(ev as any);

  test("shift+left extends a selection that copySelection returns", () => {
    const w = new InputWidget();
    w.value = "hello"; // caret at end (5)
    press(w, { name: "left", shift: true });
    press(w, { name: "left", shift: true });
    expect(w.copySelection()).toBe("lo");
  });

  test("shift+home selects to the start", () => {
    const w = new InputWidget();
    w.value = "hello";
    press(w, { name: "home", shift: true });
    expect(w.copySelection()).toBe("hello");
  });

  test("bare arrow collapses the selection (no copy)", () => {
    const w = new InputWidget();
    w.value = "hello";
    press(w, { name: "left", shift: true });
    press(w, { name: "left", shift: true });
    press(w, { name: "left" }); // collapse to left edge
    expect(w.copySelection()).toBe(null);
  });

  test("typing replaces the active selection", () => {
    const w = new InputWidget();
    w.value = "hello";
    press(w, { name: "home", shift: true }); // select all
    press(w, { key: "Z" });
    expect(w.value).toBe("Z");
  });

  test("backspace deletes the selection as one operation", () => {
    const w = new InputWidget();
    w.value = "hello";
    press(w, { name: "left", shift: true });
    press(w, { name: "left", shift: true }); // select "lo"
    press(w, { name: "backspace" });
    expect(w.value).toBe("hel");
  });

  test("selectAll then cutSelection empties the value", () => {
    const w = new InputWidget();
    w.value = "hello";
    w.selectAll();
    expect(w.cutSelection()).toBe("hello");
    expect(w.value).toBe("");
  });

  test("insertText replaces the selection and flattens newlines", () => {
    const w = new InputWidget();
    w.value = "abXYef";
    // select "XY": move to index 2 then shift-right twice
    press(w, { name: "home" });
    press(w, { name: "right" });
    press(w, { name: "right" });
    press(w, { name: "right", shift: true });
    press(w, { name: "right", shift: true });
    w.insertText("12\n34");
    expect(w.value).toBe("ab12 34ef");
  });

  test("delete removes the char ahead; end jumps to the end; right collapses a selection", () => {
    const w = new InputWidget();
    w.value = "abcd";
    press(w, { name: "home" });
    press(w, { name: "delete" }); // removes "a"
    expect(w.value).toBe("bcd");

    press(w, { name: "end" });
    press(w, { key: "!" });
    expect(w.value).toBe("bcd!");

    // A selection collapses to its right edge on a bare Right.
    press(w, { name: "home" });
    press(w, { name: "right", shift: true });
    press(w, { name: "right", shift: true });
    expect(w.hasSelection()).toBe(true);
    press(w, { name: "right" }); // collapse, no extend
    expect(w.hasSelection()).toBe(false);
  });
});

describe("InputWidget — mouse selection", () => {
  test("press anchors, drag extends, release without a selection clears the anchor", () => {
    const w = new InputWidget();
    w.value = "hello world";
    // Press then drag to a different column establishes and extends a selection.
    w.handleMouse({ type: "press", button: "left", x: 0, y: 0, handled: false } as any);
    w.handleMouse({ type: "drag", button: "left", x: 5, y: 0, handled: false } as any);
    expect(w.hasSelection()).toBe(true);

    // A release where start == end (no real selection) clears the anchor.
    w.handleMouse({ type: "press", button: "left", x: 2, y: 0, handled: false } as any);
    w.handleMouse({ type: "release", button: "left", x: 2, y: 0, handled: false } as any);
    expect(w.hasSelection()).toBe(false);
  });
});
