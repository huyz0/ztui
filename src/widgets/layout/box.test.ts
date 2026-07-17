import { describe, expect, test } from "vitest";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
import { BoxWidget } from "./box.ts";

function rowText(buffer: ScreenBuffer, y: number): string {
  return buffer.cells[y].map((c) => c.char).join("");
}

function renderBox(opts: { width: number; title?: string; border?: string }): ScreenBuffer {
  const w = new BoxWidget();
  w.style.width = opts.width;
  w.style.height = 3;
  w.style.border = opts.border ?? "rounded";
  if (opts.title !== undefined) w.title = opts.title;
  w.region = new Region(Offset.ORIGIN, new Size(opts.width, 3));

  const buffer = new ScreenBuffer(opts.width, 3);
  w.render(buffer);
  return buffer;
}

describe("box title", () => {
  test("draws title into the top border, inset past the corner", () => {
    const top = rowText(renderBox({ width: 12, title: "Hi" }), 0);
    expect(top).toBe("╭─ Hi ─────╮");
  });

  test("no title leaves the top border untouched", () => {
    const top = rowText(renderBox({ width: 8 }), 0);
    expect(top).toBe("╭──────╮");
  });

  test("title is suppressed when the box has no border", () => {
    const top = rowText(renderBox({ width: 10, title: "Hi", border: "none" }), 0);
    expect(top.includes("Hi")).toBe(false);
  });

  test("overlong title is truncated with an ellipsis, staying symmetric", () => {
    const top = rowText(renderBox({ width: 10, title: "Settings panel" }), 0);
    // The truncated title keeps its trailing space + border dash, so the right
    // edge reads ` ─╮` mirroring the left's `╭─ ` — the title is not shoved right.
    expect(top).toBe("╭─ Set… ─╮");
    expect(top.startsWith("╭─ ")).toBe(true);
    expect(top.endsWith(" ─╮")).toBe(true);
    expect([...top].length).toBe(10);
  });

  test("title is suppressed when the box is too narrow to reserve any label budget", () => {
    // width - 4 <= 0: no room at all for "─ x ─", so drawTitle bails before
    // touching the border row.
    const top = rowText(renderBox({ width: 4, title: "Hi" }), 0);
    expect(top).toBe("╭──╮");
  });

  test("truncates to a bare ellipsis when only one column of label budget is left", () => {
    // width 6 -> available = 2 -> truncateToWidth's budget (available-2=0) is
    // <= 1, so the label collapses to a single "…" rather than any real text.
    const top = rowText(renderBox({ width: 6, title: "Settings" }), 0);
    expect(top).toBe("╭─ … ╮");
    expect([...top].length).toBe(6);
  });

  test("no-ops when the buffer is too small to have a styled cell at the border position", () => {
    // The box's own region claims width 10 (room for a title), but the actual
    // buffer it paints into is only 1 column wide. `buffer.cells[rect.y]?.[rect.x + 1]`
    // is then out of range, so `borderStyle` is undefined and drawTitle must
    // bail rather than throw trying to paint past the buffer's edge.
    const w = new BoxWidget();
    w.style.width = 10;
    w.style.height = 3;
    w.style.border = "rounded";
    w.title = "Hi";
    w.region = new Region(Offset.ORIGIN, new Size(10, 3));

    const buffer = new ScreenBuffer(1, 3);
    expect(() => w.render(buffer)).not.toThrow();
  });

  test("stops painting the title once it reaches the right border, without overrunning it", () => {
    // A wide (double-column) grapheme in the title means charWidth-based
    // cursor advancement can outpace stringWidth-based truncation budgeting,
    // so the paint loop's own right-edge guard (not just the pre-truncation
    // budget) is what stops it from writing past the corner.
    const top = rowText(renderBox({ width: 10, title: "深深深深深深深深" }), 0);
    expect(top.startsWith("╭─")).toBe(true);
    // The right corner must still be the last visible glyph on the row - the
    // loop's right-edge guard, not just pre-truncation budgeting, is what
    // keeps painting from overrunning it.
    expect(top.trim().endsWith("╮")).toBe(true);
  });
});
