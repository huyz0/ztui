import { describe, expect, test } from "vitest";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { ScreenBuffer } from "../render/buffer.ts";
import { Widget } from "./widget.ts";

/**
 * Guards the background-fill skip in {@link Widget.render}: a transparent
 * in-flow widget must NOT re-paint cells an ancestor already filled (that's the
 * overdraw the optimization removes), while anything whose fill could change a
 * pixel must still paint.
 */

/** A 6×4 widget at the origin with the given inline styles, plus a child tree. */
function tree(parentStyles: Record<string, unknown>, child?: Widget) {
  const parent = new Widget("box");
  Object.assign(parent.style, { width: 6, height: 4 }, parentStyles);
  parent.region = new Region(Offset.ORIGIN, new Size(6, 4));
  if (child) {
    parent.appendChild(child);
    child.region = new Region(Offset.ORIGIN, new Size(6, 4)); // fills the same area
  }
  return parent;
}

/** Render `w` and return how many times `setCell` was invoked. */
function countSetCell(w: Widget): { calls: number; buffer: ScreenBuffer } {
  const buffer = new ScreenBuffer(6, 4);
  let calls = 0;
  const orig = buffer.setCell.bind(buffer);
  (buffer as unknown as { setCell: typeof buffer.setCell }).setCell = (x, y, c, s) => {
    calls++;
    return orig(x, y, c, s);
  };
  // Styles must be resolved before render; tests set inline style, so mirror it.
  for (const node of [w, ...w.children] as Widget[]) {
    node.computedStyle = node.style;
  }
  w.render(buffer);
  return { calls, buffer };
}

describe("background-fill overdraw skip", () => {
  const AREA = 6 * 4; // 24 cells

  test("a transparent in-flow child skips its fill (no overdraw)", () => {
    const child = new Widget("box"); // no background → inherits parent's
    const parent = tree({ background: "#102030" }, child);
    const { calls, buffer } = countSetCell(parent);
    // Parent fills 24 cells; the transparent child adds none.
    expect(calls).toBe(AREA);
    // …and the cells still show the inherited background (correctness).
    expect(buffer.cells[1][1].style.background).toBe("#102030");
  });

  test("a child with its own opaque background still fills", () => {
    const child = new Widget("box");
    Object.assign(child.style, { background: "#aabbcc" });
    const parent = tree({ background: "#102030" }, child);
    const { calls, buffer } = countSetCell(parent);
    expect(calls).toBe(AREA * 2); // both paint their 24 cells
    expect(buffer.cells[1][1].style.background).toBe("#aabbcc"); // child wins on top
  });

  test("an absolutely-positioned transparent child still fills", () => {
    const child = new Widget("box");
    Object.assign(child.style, { position: "absolute" });
    const parent = tree({ background: "#102030" }, child);
    expect(countSetCell(parent).calls).toBe(AREA * 2);
  });

  test("a transparent child with a blank-cell-visible attribute still fills", () => {
    for (const attr of ["underline", "reverse", "strikethrough"] as const) {
      const child = new Widget("box");
      Object.assign(child.style, { [attr]: true });
      const parent = tree({ background: "#102030" }, child);
      expect(countSetCell(parent).calls, `${attr} must still fill`).toBe(AREA * 2);
    }
  });

  test("a transparent child with only invisible attrs (bold/dim) still skips", () => {
    const child = new Widget("box");
    Object.assign(child.style, { bold: true, dim: true, color: "#ff0000" });
    const parent = tree({ background: "#102030" }, child);
    expect(countSetCell(parent).calls).toBe(AREA); // skipped — none of these show on a space
  });
});
