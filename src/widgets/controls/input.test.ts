import { describe, expect, test } from "vitest";
import { InputWidget } from "./input.ts";

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
});
