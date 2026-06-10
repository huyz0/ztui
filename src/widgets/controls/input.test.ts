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
