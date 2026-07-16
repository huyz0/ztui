import { describe, expect, test } from "vitest";
import { Widget } from "../dom/widget.ts";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { Box, Label } from "../react/components.tsx";
import "../widgets/index.ts";
import { mountApp } from "../test/harness.tsx";
import { ScrollableBoxWidget } from "../widgets/layout/box.ts";
import { hitTest, isPointOnScrollbar } from "./hit-test.ts";

describe("hitTest", () => {
  test("resolves the deepest widget under a point", async () => {
    const t = await mountApp(
      <Box id="outer" style={{ width: 20, height: 6, padding: 1 }}>
        <Label id="inner">hi</Label>
      </Box>,
    );
    await t.settle();
    const inner = t.findById("inner");
    // The label sits one cell in from the padded outer box.
    expect(hitTest(t.screen, 1, 1)).toBe(inner);
  });

  test("returns null when the point is outside every widget", async () => {
    const t = await mountApp(<Box id="b" style={{ width: 4, height: 2 }} />);
    await t.settle();
    expect(hitTest(t.screen, 99, 99)).toBeNull();
  });

  test("an invisible widget (and its subtree) is never hit", async () => {
    const t = await mountApp(
      <Box id="b" style={{ width: 10, height: 4 }}>
        <Label id="child">x</Label>
      </Box>,
    );
    await t.settle();
    const b = t.findById("b");
    expect(hitTest(t.screen, 0, 0)).toBe(t.findById("child"));
    // Hiding the box prunes the whole branch from hit-testing.
    if (b) b.visible = false;
    expect(hitTest(t.screen, 0, 0)).toBe(t.screen);
  });

  test("a higher z-index sibling wins over one drawn later in document order", async () => {
    // Two overlapping boxes; the second paints on top by default, but a higher
    // zIndex on the first must override paint order in the hit-test.
    const t = await mountApp(
      <Box style={{ width: 20, height: 6 }}>
        <Box id="hi" style={{ width: 10, height: 4, zIndex: 5, position: "absolute" }} />
        <Box id="lo" style={{ width: 10, height: 4, zIndex: 1, position: "absolute" }} />
      </Box>,
    );
    await t.settle();
    expect(hitTest(t.screen, 0, 0)).toBe(t.findById("hi"));
  });

  test("two overlapping same-z-index siblings hit-test to the later (topmost-painted) one", async () => {
    // Regression: both the fast (no-z-index) and z-sorted child-resolution
    // paths iterated children in ascending document order and returned the
    // first match. But renderChildren paints in that same ascending order, so
    // the *later* sibling is the one actually drawn on top. A click on the
    // overlap resolved to the earlier, visually-covered sibling instead of the
    // one the user could actually see and click.
    const t = await mountApp(
      <Box style={{ width: 20, height: 6 }}>
        <Box id="under" style={{ width: 10, height: 4, position: "absolute" }} />
        <Box id="over" style={{ width: 10, height: 4, position: "absolute" }} />
      </Box>,
    );
    await t.settle();
    expect(hitTest(t.screen, 0, 0)).toBe(t.findById("over"));
  });

  test("a pointer-transparent widget (and its subtree) never captures the pointer", async () => {
    const t = await mountApp(
      <Box id="b" style={{ width: 10, height: 4 }}>
        <Label id="child">x</Label>
      </Box>,
    );
    await t.settle();
    const b = t.findById("b");
    expect(hitTest(t.screen, 0, 0)).toBe(t.findById("child"));
    if (b) b.pointerTransparent = true;
    // The decorative overlay itself, and its whole subtree, fall through.
    expect(hitTest(t.screen, 0, 0)).toBe(t.screen);
  });

  test("overlays with differing z-index resolve highest-first regardless of add order", async () => {
    const t = await mountApp(<Box style={{ width: 20, height: 6 }} />);
    await t.settle();

    const overlayLow = new Widget("overlay-low");
    overlayLow.region = new Region(new Offset(0, 0), new Size(10, 4));
    // No explicit zIndex — exercises the `?? 0` default alongside overlays
    // that do set one, within the same needsSort=true comparator.
    const overlayLow2 = new Widget("overlay-low-2");
    overlayLow2.region = new Region(new Offset(0, 0), new Size(10, 4));
    overlayLow2.style = { zIndex: 1 };
    const overlayHigh = new Widget("overlay-high");
    overlayHigh.region = new Region(new Offset(0, 0), new Size(10, 4));
    overlayHigh.style = { zIndex: 10 };

    // Added highest-z first (so plain reverse-of-insertion-order would pick
    // a low-z overlay); the differing-z-index sort must still put the
    // highest z-index overlay on top regardless of add order. The two
    // same-z overlays also exercise the sort's tie-break (later index wins)
    // within the same needsSort=true pass.
    t.screen.addOverlay(overlayHigh);
    t.screen.addOverlay(overlayLow);
    t.screen.addOverlay(overlayLow2);

    expect(hitTest(t.screen, 1, 1)).toBe(overlayHigh);
    overlayHigh.pointerTransparent = true;
    expect(hitTest(t.screen, 1, 1)).toBe(overlayLow2);
  });

  test("isPointOnScrollbar is false for a non-scrollable widget", async () => {
    const t = await mountApp(<Box id="b" style={{ width: 10, height: 4 }} />);
    await t.settle();
    const w = t.findById("b");
    expect(w && isPointOnScrollbar(w, 0, 0)).toBe(false);
  });

  test("isPointOnScrollbar matches drawScrollbars' guard when content has collapsed to zero height", () => {
    // Regression: drawScrollbars skips painting when the content rect has
    // collapsed to zero height (border + padding leaving nothing), but the
    // border-only track math (client-based, ignoring padding) can still be
    // positive — isPointOnScrollbar lacked the matching `content.height > 0`
    // guard, so an invisible scrollbar could still swallow clicks.
    const w = new ScrollableBoxWidget();
    w.style = { width: 10, height: 4, border: "rounded", padding: 2, overflowY: "scroll" };
    w.region = new Region(new Offset(0, 0), new Size(10, 4));

    const client = w.getClientRect();
    expect(w.getContentRect().height).toBe(0); // content collapsed
    // The would-be scrollbar column, one row inside the border — inside the
    // border-only track range but over a rect that never actually painted.
    expect(isPointOnScrollbar(w, client.right - 1, client.y + 1)).toBe(false);
  });

  test("two overlapping same-z-index overlays hit-test to the most recently added (topmost-painted) one", async () => {
    const t = await mountApp(<Box style={{ width: 20, height: 6 }} />);
    await t.settle();

    const overlayA = new Widget("overlay-a");
    overlayA.region = new Region(new Offset(0, 0), new Size(10, 4));
    const overlayB = new Widget("overlay-b");
    overlayB.region = new Region(new Offset(0, 0), new Size(10, 4));

    // addOverlay appends (paints later == on top), matching real usage —
    // opening dialog A then dialog B should make B topmost.
    t.screen.addOverlay(overlayA);
    t.screen.addOverlay(overlayB);

    expect(hitTest(t.screen, 1, 1)).toBe(overlayB);
  });
});
