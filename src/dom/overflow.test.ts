import { describe, expect, test } from "vitest";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { ScreenBuffer } from "../render/buffer.ts";
import { Style } from "../render/style.ts";
import { LabelWidget } from "../widgets/text/label.ts";
import { TextNode } from "./text-node.ts";
import { Widget } from "./widget.ts";

/** A widget that fills its entire region with '#'. */
class Filler extends Widget {
  override render(buffer: ScreenBuffer): void {
    const r = this.region;
    for (let y = r.y; y < r.bottom; y++) {
      for (let x = r.x; x < r.right; x++) {
        buffer.setCell(x, y, "#", Style.DEFAULT);
      }
    }
  }
}

function makeTree(overflow: "hidden" | "visible") {
  const parent = new Widget("view");
  parent.region = new Region(new Offset(0, 0), new Size(5, 2));
  parent.style = overflow === "visible" ? { overflowX: "visible", overflowY: "visible" } : {};
  const child = new Filler("f");
  // Child is larger than the parent content box (would overflow).
  child.region = new Region(new Offset(0, 0), new Size(10, 5));
  parent.appendChild(child);
  return parent;
}

describe("overflow containment", () => {
  test("default clips children to the content box", () => {
    const buf = new ScreenBuffer(10, 5);
    makeTree("hidden").renderChildren(buf);

    // Inside the 5x2 content box → drawn.
    expect(buf.cells[0][4].char).toBe("#");
    expect(buf.cells[1][4].char).toBe("#");
    // Outside the content box → clipped (not overwritten).
    expect(buf.cells[0][5].char).toBe(" ");
    expect(buf.cells[2][0].char).toBe(" ");
  });

  test("overflow:visible opts out — content can overflow", () => {
    const buf = new ScreenBuffer(10, 5);
    makeTree("visible").renderChildren(buf);

    // With the opt-out, the child paints beyond the parent's box.
    expect(buf.cells[0][5].char).toBe("#");
    expect(buf.cells[2][0].char).toBe("#");
  });
});

describe("constrained-space measure", () => {
  test("auto-sized content is clamped to the offered width", () => {
    const label = new LabelWidget();
    label.appendChild(new TextNode("x".repeat(100)));
    label.measure(10, 5);
    expect(label.measuredWidth).toBe(10);
  });

  test("content smaller than the offered space keeps its intrinsic size", () => {
    const label = new LabelWidget();
    label.appendChild(new TextNode("hi"));
    label.measure(40, 5);
    expect(label.measuredWidth).toBe(2);
  });
});
