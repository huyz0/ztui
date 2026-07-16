import { describe, expect, test } from "vitest";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { ScreenBuffer } from "../render/buffer.ts";
import { OverlayRootWidget } from "./overlay.ts";
import { Widget } from "./widget.ts";

function rect(x: number, y: number, w: number, h: number): Region {
  return new Region(new Offset(x, y), new Size(w, h));
}

describe("OverlayRootWidget.layoutChildren", () => {
  test("returns true and does nothing when there is no visible child", () => {
    const root = new OverlayRootWidget();
    root.region = rect(0, 0, 80, 24);
    // A child exists but is invisible, so it must be treated like "no child".
    const hidden = new Widget("box");
    hidden.visible = false;
    root.appendChild(hidden);
    expect(root.layoutChildren()).toBe(true);
  });

  test("sticky panel: explicit 'above' placement pins the panel above the anchor", () => {
    const root = new OverlayRootWidget();
    root.region = rect(0, 0, 80, 24);
    const anchor = new Widget("box");
    anchor.region = rect(10, 10, 20, 2);
    root.anchor = anchor;
    root.placement = "above" as never; // legacy vertical value, not a Side
    // Force the legacy vertical branch by using a placement value that isn't
    // one of the four Side strings ("above" isn't "top"/"bottom"/"left"/"right").
    const child = new Widget("box");
    child.measuredWidth = 10;
    child.measuredHeight = 3;
    root.appendChild(child);

    root.layoutChildren();

    expect(child.region.y).toBe(anchor.region.y - 3);
  });

  test("sticky panel: explicit 'below' placement pins the panel below the anchor", () => {
    const root = new OverlayRootWidget();
    root.region = rect(0, 0, 80, 24);
    const anchor = new Widget("box");
    anchor.region = rect(10, 10, 20, 2);
    root.anchor = anchor;
    root.placement = "below" as never;
    const child = new Widget("box");
    child.measuredWidth = 10;
    child.measuredHeight = 3;
    root.appendChild(child);

    root.layoutChildren();

    expect(child.region.y).toBe(anchor.region.bottom);
  });

  test("sticky panel: auto placement flips above only when below can't fit but above can", () => {
    const root = new OverlayRootWidget();
    root.region = rect(0, 0, 80, 24);
    const anchor = new Widget("box");
    // Anchor near the bottom: only 2 rows below, 20 above.
    anchor.region = rect(10, 20, 20, 2);
    root.anchor = anchor;
    root.placement = "auto";
    const child = new Widget("box");
    child.measuredWidth = 10;
    child.measuredHeight = 5; // doesn't fit in the 2 rows below
    root.appendChild(child);

    root.layoutChildren();

    expect(child.region.y).toBe(anchor.region.y - 5);
  });

  test("sticky panel: auto placement stays below when it fits", () => {
    const root = new OverlayRootWidget();
    root.region = rect(0, 0, 80, 24);
    const anchor = new Widget("box");
    anchor.region = rect(10, 5, 20, 2);
    root.anchor = anchor;
    root.placement = "auto";
    const child = new Widget("box");
    child.measuredWidth = 10;
    child.measuredHeight = 3;
    root.appendChild(child);

    root.layoutChildren();

    expect(child.region.y).toBe(anchor.region.bottom);
  });

  test("fixed screen offsets: explicit style.bottom positions the panel from the bottom edge", () => {
    const root = new OverlayRootWidget();
    root.region = rect(0, 0, 80, 24);
    const child = new Widget("box");
    child.measuredWidth = 10;
    child.measuredHeight = 3;
    child.style.bottom = 2;
    root.appendChild(child);

    root.layoutChildren();

    // screen.bottom(24) - height(3) - offset(2) = 19
    expect(child.region.y).toBe(19);
  });

  test("fixed screen offsets: explicit style.right positions the panel from the right edge", () => {
    const root = new OverlayRootWidget();
    root.region = rect(0, 0, 80, 24);
    const child = new Widget("box");
    child.measuredWidth = 10;
    child.measuredHeight = 3;
    child.style.right = 5;
    root.appendChild(child);

    root.layoutChildren();

    // screen.right(80) - width(10) - offset(5) = 65
    expect(child.region.x).toBe(65);
  });

  test("fixed screen offsets: an 'fr' left offset falls back to 0 rather than an object", () => {
    const root = new OverlayRootWidget();
    root.region = rect(0, 0, 80, 24);
    const child = new Widget("box");
    child.measuredWidth = 10;
    child.measuredHeight = 3;
    child.style.left = "1fr"; // parseDimension returns { fr: 1 }, not a number
    root.appendChild(child);

    root.layoutChildren();

    expect(child.region.x).toBe(0);
  });
});

describe("OverlayRootWidget.render", () => {
  test("does nothing when the overlay root itself is invisible", () => {
    const root = new OverlayRootWidget();
    root.region = rect(0, 0, 10, 10);
    root.visible = false;
    const buffer = new ScreenBuffer(10, 10);
    const before = JSON.stringify(buffer.cells);
    root.render(buffer);
    expect(JSON.stringify(buffer.cells)).toBe(before);
  });

  test("skips casting a shadow for an invisible child", () => {
    const root = new OverlayRootWidget();
    root.region = rect(0, 0, 20, 20);
    root.shadow = true;
    const child = new Widget("box");
    child.region = rect(2, 2, 5, 5);
    child.visible = false;
    root.appendChild(child);
    const buffer = new ScreenBuffer(20, 20);
    // Should not throw, and no shadow should be blended for the hidden child.
    expect(() => root.render(buffer)).not.toThrow();
  });

  test("skips a zero-size region without attempting to draw a shadow", () => {
    const root = new OverlayRootWidget();
    root.region = rect(0, 0, 20, 20);
    root.shadow = true;
    const child = new Widget("box");
    child.region = rect(2, 2, 0, 0); // zero width/height
    root.appendChild(child);
    const buffer = new ScreenBuffer(20, 20);
    expect(() => root.render(buffer)).not.toThrow();
  });
});
