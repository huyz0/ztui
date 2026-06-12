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

  test("overlong title is truncated with an ellipsis", () => {
    const top = rowText(renderBox({ width: 10, title: "Settings panel" }), 0);
    expect(top.startsWith("╭─ ")).toBe(true);
    expect(top).toContain("…");
    expect(top.endsWith("╮")).toBe(true);
    expect([...top].length).toBe(10);
  });
});
