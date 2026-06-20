import { describe, expect, test } from "vitest";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { ScreenBuffer } from "../render/buffer.ts";
import { Widget } from "./widget.ts";

/**
 * Guards the render-Style cache: a widget must hand cells the *same* Style
 * instance across frames while its style is unchanged (so the diff's `a === b`
 * identity fast path fires), and a *new* instance the moment a field changes.
 */

function paint(w: Widget): ScreenBuffer {
  const buffer = new ScreenBuffer(4, 3);
  w.render(buffer);
  return buffer;
}

function fillStyleOf(w: Widget) {
  // A widget with its own opaque background fills its cells with the render
  // Style; read it back from a painted cell.
  return paint(w).cells[1][1].style;
}

describe("render-Style cache (diff identity fast path)", () => {
  function ownBgWidget() {
    const w = new Widget("box");
    w.region = new Region(Offset.ORIGIN, new Size(4, 3));
    w.computedStyle = { background: "#123456", color: "#abcdef" };
    return w;
  }

  test("an unchanged widget returns the same Style instance across frames", () => {
    const w = ownBgWidget();
    const a = fillStyleOf(w);
    const b = fillStyleOf(w);
    expect(b).toBe(a); // identical reference → diff short-circuits
  });

  test("a changed style field yields a new Style instance", () => {
    const w = ownBgWidget();
    const a = fillStyleOf(w);
    w.computedStyle = { ...w.computedStyle, background: "#654321" };
    const b = fillStyleOf(w);
    expect(b).not.toBe(a);
    expect(b.background).toBe("#654321");
  });

  test("the cached style carries the resolved fields", () => {
    const w = ownBgWidget();
    w.computedStyle = { background: "#222222", color: "#eeeeee", bold: true, dim: true };
    const s = fillStyleOf(w);
    expect(s.background).toBe("#222222");
    expect(s.color).toBe("#eeeeee");
    expect(s.bold).toBe(true);
    expect(s.dim).toBe(true);
  });

  test("toggling a boolean attribute invalidates the cache", () => {
    const w = ownBgWidget();
    w.computedStyle = { background: "#333", bold: false };
    const a = fillStyleOf(w);
    w.computedStyle = { ...w.computedStyle, bold: true };
    const b = fillStyleOf(w);
    expect(b).not.toBe(a);
    expect(b.bold).toBe(true);
  });
});
