import { describe, expect, test, vi } from "vitest";
import { Offset } from "../../../geometry/offset.ts";
import { Region } from "../../../geometry/region.ts";
import { Size } from "../../../geometry/size.ts";
import { ScreenBuffer } from "../../../render/buffer.ts";
import { CompletionPopupWidget } from "./completion-popup.ts";
import type { Completion } from "./types.ts";

function popup(items: Completion[], region = new Region(new Offset(0, 0), new Size(40, 12))) {
  const w = new CompletionPopupWidget();
  w.items = items;
  w.region = region;
  return w;
}

const ITEMS: Completion[] = [
  { label: "alpha", detail: "file" },
  { label: "beta" },
  { label: "gamma", detail: "dir" },
];

describe("CompletionPopupWidget", () => {
  test("boxRect anchors below the caret and clamps to the screen", () => {
    const w = popup(ITEMS);
    w.anchorX = 2;
    w.anchorY = 1;
    const r = w.boxRect();
    expect(r.y).toBe(2); // one below the caret line
    expect(r.x).toBe(2);
    expect(r.w).toBeGreaterThanOrEqual(12);
  });

  test("boxRect flips above when it would overflow the bottom", () => {
    const w = popup(ITEMS, new Region(new Offset(0, 0), new Size(40, 8)));
    w.anchorX = 0;
    w.anchorY = 7; // near the bottom; box (h=5) flips above
    const r = w.boxRect();
    expect(r.y).toBeLessThan(7);
  });

  test("boxRect shifts left when it would overflow the right edge", () => {
    const w = popup(ITEMS, new Region(new Offset(0, 0), new Size(20, 12)));
    w.anchorX = 18;
    w.anchorY = 0;
    const r = w.boxRect();
    expect(r.x + r.w).toBeLessThanOrEqual(20);
  });

  test("a press inside a row chooses it; outside dismisses; non-press is ignored", () => {
    const onChoose = vi.fn();
    const onDismiss = vi.fn();
    const w = popup(ITEMS);
    w.anchorX = 0;
    w.anchorY = 0;
    w.onChoose = onChoose;
    w.onDismiss = onDismiss;
    const r = w.boxRect();

    const press = (x: number, y: number) => {
      const ev = { type: "press", button: "left", x, y, handled: false } as any;
      w.handleMouse(ev);
      return ev.handled;
    };

    // First row sits just under the top border.
    expect(press(r.x + 1, r.y + 1)).toBe(true);
    expect(onChoose).toHaveBeenCalledWith(0);

    // A click well outside the box dismisses.
    expect(press(r.x + r.w + 5, r.y)).toBe(true);
    expect(onDismiss).toHaveBeenCalled();

    // A non-press event is left untouched.
    const move = { type: "move", x: r.x, y: r.y, handled: false } as any;
    w.handleMouse(move);
    expect(move.handled).toBe(false);
  });

  test("render draws a bordered box with labels, details, and a windowed selection", () => {
    const many: Completion[] = Array.from({ length: 12 }, (_, i) => ({
      label: `item-${i}`,
      detail: i % 2 ? "x" : undefined,
    }));
    const w = popup(many, new Region(new Offset(0, 0), new Size(40, 16)));
    w.anchorX = 0;
    w.anchorY = 0;
    w.selectedIndex = 11; // forces the visible window to scroll down
    const buf = new ScreenBuffer();
    buf.resize(40, 16);
    expect(() => w.render(buf)).not.toThrow();
    const text = buf.cells.map((row) => row.map((c) => c.char).join("")).join("\n");
    expect(text).toContain("item-11"); // selected, in-window
    expect(text).toContain("╭"); // border drawn

    // An empty popup renders nothing and does not throw.
    const empty = popup([]);
    expect(() => empty.render(buf)).not.toThrow();
  });
});
