import { describe, expect, test } from "vitest";
import { App } from "../core/app.ts";
import { MockDriver } from "../driver/mock/index.ts";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { ScreenBuffer } from "../render/buffer.ts";
import { Style } from "../render/style.ts";
import { flush, waitFor } from "../test/harness.tsx";
import { Scrollable } from "./scrollable.ts";
import { Widget } from "./widget.ts";

class TestBox extends Widget {
  constructor() {
    super("test-box");
  }
}

const ScrollableBox = Scrollable(TestBox);

describe("Scrollable Mixin", () => {
  test("mixin structure and defaults", () => {
    const scrollBox = new ScrollableBox();
    expect(scrollBox.tagName).toBe("test-box");
    expect(scrollBox.scrollableX).toBe(true);
    expect(scrollBox.scrollableY).toBe(true);
    expect(scrollBox.focusable).toBe(true);
    expect(scrollBox.scrollOffset.equals(Offset.ORIGIN)).toBe(true);
  });

  test("measurement bypass of children limits", () => {
    const scrollBox = new ScrollableBox();
    scrollBox.style.width = 10;
    scrollBox.style.height = 10;

    const child = new Widget("label");
    child.style.width = 20;
    child.style.height = 20;
    scrollBox.appendChild(child);

    // Call measure with constraints of 10, 10
    scrollBox.measure(10, 10);

    // Because scrollBox is scrollable, it should measure child with childMaxW/childMaxH (10000)
    // and thus child's measured size remains 20, 20.
    expect(child.measuredWidth).toBe(20);
    expect(child.measuredHeight).toBe(20);

    // scrollBox itself is sized according to its own style
    expect(scrollBox.measuredWidth).toBe(10);
    expect(scrollBox.measuredHeight).toBe(10);
  });

  test("content size computation", () => {
    const scrollBox = new ScrollableBox();
    scrollBox.region = new Region(Offset.ORIGIN, new Size(10, 10));

    const child = new Widget("label");
    child.region = new Region(new Offset(2, 3), new Size(15, 15));
    scrollBox.appendChild(child);

    const contentSize = scrollBox.getContentSize();
    expect(contentSize.width).toBe(17);
    expect(contentSize.height).toBe(18);
  });

  test("positionFixed children are excluded from content size, since their region is never scroll-shifted", () => {
    // Regression: getContentSize() reconstructed each child's unscrolled
    // extent as `child.region.right/bottom + scrollOffset`, which is only
    // valid for children whose region was shifted by -scrollOffset during
    // layout. The layout pass explicitly skips that shift for positionFixed
    // children (e.g. a pinned CopyButton), so adding scrollOffset back onto
    // an already-unshifted region inflated the reported content size once
    // the view was scrolled.
    const scrollBox = new ScrollableBox();
    scrollBox.region = new Region(Offset.ORIGIN, new Size(10, 10));
    scrollBox.scrollOffset = new Offset(0, 50);

    const fixedChild = new Widget("pinned");
    fixedChild.positionFixed = true;
    fixedChild.region = new Region(new Offset(8, 0), new Size(2, 1));
    scrollBox.appendChild(fixedChild);

    const contentSize = scrollBox.getContentSize();
    // Only the fixed child is present, so with no real flow content the
    // reported content size should be 0 — not inflated by scrollOffset.
    expect(contentSize.height).toBe(0);
  });

  test("key scroll event handling", () => {
    const scrollBox = new ScrollableBox();
    scrollBox.region = new Region(Offset.ORIGIN, new Size(5, 5));

    const child = new Widget("label");
    child.region = new Region(Offset.ORIGIN, new Size(10, 10));
    scrollBox.appendChild(child);

    // Initial scroll is 0
    expect(scrollBox.scrollOffset.y).toBe(0);

    // Arrow down key event
    const downEv = {
      key: "down",
      name: "down",
      ctrl: false,
      meta: false,
      shift: false,
      handled: false,
    };
    scrollBox.handleKey(downEv);
    expect(downEv.handled).toBe(true);
    expect(scrollBox.scrollOffset.y).toBe(1);

    // Arrow up key event
    const upEv = { key: "up", name: "up", ctrl: false, meta: false, shift: false, handled: false };
    scrollBox.handleKey(upEv);
    expect(upEv.handled).toBe(true);
    expect(scrollBox.scrollOffset.y).toBe(0);

    // Page down event
    const pgDnEv = {
      key: "pagedown",
      name: "pagedown",
      ctrl: false,
      meta: false,
      shift: false,
      handled: false,
    };
    scrollBox.handleKey(pgDnEv);
    // content.height is 4 (one row reserved for the horizontal scrollbar gutter),
    // so a page scrolls by height - 1 = 3.
    expect(scrollBox.scrollOffset.y).toBe(3);

    // Page up event
    const pgUpEv = {
      key: "pageup",
      name: "pageup",
      ctrl: false,
      meta: false,
      shift: false,
      handled: false,
    };
    scrollBox.handleKey(pgUpEv);
    expect(scrollBox.scrollOffset.y).toBe(0);

    // Arrow right event
    const rightEv = {
      key: "right",
      name: "right",
      ctrl: false,
      meta: false,
      shift: false,
      handled: false,
    };
    scrollBox.handleKey(rightEv);
    expect(scrollBox.scrollOffset.x).toBe(1);

    // Arrow left event
    const leftEv = {
      key: "left",
      name: "left",
      ctrl: false,
      meta: false,
      shift: false,
      handled: false,
    };
    scrollBox.handleKey(leftEv);
    expect(scrollBox.scrollOffset.x).toBe(0);
  });

  test("mouse wheel scroll event handling", () => {
    const scrollBox = new ScrollableBox();
    scrollBox.region = new Region(Offset.ORIGIN, new Size(5, 5));

    const child = new Widget("label");
    child.region = new Region(Offset.ORIGIN, new Size(10, 10));
    scrollBox.appendChild(child);

    // scroll down mouse event (content 10 tall, viewport 5 -> maxScrollY 5;
    // one wheel tick moves 3 rows)
    const scrollDownEv: any = { x: 2, y: 2, type: "scroll_down", button: "none", handled: false };
    scrollBox.handleScroll(scrollDownEv);
    expect(scrollDownEv.handled).toBe(true);
    expect(scrollBox.scrollOffset.y).toBe(3);

    // scroll up mouse event
    const scrollUpEv: any = { x: 2, y: 2, type: "scroll_up", button: "none", handled: false };
    scrollBox.handleScroll(scrollUpEv);
    expect(scrollUpEv.handled).toBe(true);
    expect(scrollBox.scrollOffset.y).toBe(0);
  });

  test("a visible scrollbar reserves a content gutter and paints at the viewport edge", () => {
    const scrollBox = new ScrollableBox();
    scrollBox.style = { overflowY: "scroll", overflowX: "hidden" };
    scrollBox.region = new Region(Offset.ORIGIN, new Size(6, 4));

    const child = new Widget("label");
    child.region = new Region(Offset.ORIGIN, new Size(4, 20)); // tall, fits width
    scrollBox.appendChild(child);

    // Content reserves the rightmost column for the vertical bar; full viewport
    // is unchanged. No horizontal bar, so height is untouched.
    expect(scrollBox.getContentRect().width).toBe(5);
    expect(scrollBox.getContentRect().height).toBe(4);
    expect(scrollBox.getViewportRect().width).toBe(6);

    const buffer = new ScreenBuffer(6, 4);
    buffer.clear();
    scrollBox.render(buffer);
    // The bar is painted in the reserved column (x = 5), not over content.
    const reservedCol = [0, 1, 2, 3].map((y) => buffer.cells[y][5].char).join("");
    expect(reservedCol.trim().length).toBeGreaterThan(0);
  });

  test("clipping of children rendering", () => {
    const scrollBox = new ScrollableBox();
    // Set region of parent to 3x3
    scrollBox.region = new Region(Offset.ORIGIN, new Size(3, 3));

    const child = new Widget("label");
    // Position child so it extends outside parent
    child.region = new Region(Offset.ORIGIN, new Size(1, 5));
    scrollBox.appendChild(child);

    // Override child render to draw 'X' on all its cells
    child.render = (buf: ScreenBuffer) => {
      for (let y = child.region.y; y < child.region.bottom; y++) {
        buf.setCell(child.region.x, y, "X", {} as any);
      }
    };

    const buffer = new ScreenBuffer(6, 6);
    buffer.clear();

    scrollBox.render(buffer);

    // Cells at y=0, 1, 2 should have 'X'
    expect(buffer.cells[0][0].char).toBe("X");
    expect(buffer.cells[1][0].char).toBe("X");
    expect(buffer.cells[2][0].char).toBe("X");
    // Cells at y=3, 4 should be clipped because scrollBox content height is 3!
    expect(buffer.cells[3][0].char).toBe(" ");
    expect(buffer.cells[4][0].char).toBe(" ");
  });

  test("scroll-edge fade tints the top/bottom rows only when content is hidden there", () => {
    const make = () => {
      const box = new ScrollableBox();
      box.computedStyle.overflowY = "scroll";
      box.region = new Region(Offset.ORIGIN, new Size(5, 5)); // content rect y=0..5
      const child = new Widget("label");
      child.region = new Region(Offset.ORIGIN, new Size(5, 20)); // 20 tall → 15 scrollable
      // Paint every child cell solid white so the fade is detectable as a colour shift.
      child.render = (buf: ScreenBuffer) => {
        for (let y = 0; y < 20; y++)
          for (let x = 0; x < 5; x++) buf.setCell(x, y, "X", new Style({ color: "#ffffff" }));
      };
      box.appendChild(child);
      return box;
    };
    const white = (cell: { style: Style }) => cell.style.color === "#ffffff";

    // Scrolled to the middle: content hidden both above and below → both edges fade.
    const mid = make();
    mid.scrollOffset = new Offset(0, 5);
    let buf = new ScreenBuffer(6, 6);
    mid.render(buf);
    expect(white(buf.cells[0][0])).toBe(false); // top row faded
    expect(white(buf.cells[2][0])).toBe(true); // middle row untouched
    expect(white(buf.cells[4][0])).toBe(false); // bottom row faded

    // At the very top: nothing hidden above, so the top row stays crisp; bottom fades.
    const top = make();
    buf = new ScreenBuffer(6, 6);
    top.render(buf);
    expect(white(buf.cells[0][0])).toBe(true); // top crisp
    expect(white(buf.cells[4][0])).toBe(false); // bottom still has hidden content
  });

  test("App event bubbling integration", async () => {
    const driver = new MockDriver(40, 10);
    const app = new App(driver);
    app.run();

    const scrollBox = new ScrollableBox();
    scrollBox.region = new Region(Offset.ORIGIN, new Size(5, 5));
    app.activeScreen.appendChild(scrollBox);

    const child = new Widget("button");
    child.region = new Region(Offset.ORIGIN, new Size(10, 10));
    scrollBox.appendChild(child);

    app.activeScreen.focusWidget(child);

    // Wait for App.run and initial render microtask.
    await waitFor(() => scrollBox.region.width > 0);

    // Simulate key down on driver
    driver.simulateKey("down", "down", false, false);

    // Key event should bubble up from child to scrollBox and scroll it down.
    // The scrollbar gutter shrinks the viewport by a row/column, so auto-scroll
    // focus lands at 6 and the down key scrolls it to 7.
    await waitFor(() => scrollBox.scrollOffset.y === 7);
    expect(scrollBox.scrollOffset.y).toBe(7);

    // Clean up
    app.stop();
  });

  test("Render Culling: completely off-screen child is not rendered", () => {
    const scrollBox = new ScrollableBox();
    scrollBox.region = new Region(Offset.ORIGIN, new Size(5, 5));

    const child = new Widget("label");
    // Position child completely outside parent's bounds (e.g. from y=10 to y=15)
    child.region = new Region(new Offset(0, 10), new Size(5, 5));
    scrollBox.appendChild(child);

    let renderCalled = false;
    child.render = () => {
      renderCalled = true;
    };

    const buffer = new ScreenBuffer(10, 10);
    buffer.clear();

    scrollBox.render(buffer);

    expect(renderCalled).toBe(false); // Culled because child.region (y=10..15) is completely outside scrollBox content rect (y=0..5)
  });

  test("Auto-scroll focus updates parent scrollOffset", () => {
    const driver = new MockDriver(40, 20);
    const app = new App(driver);
    app.run();

    const scrollBox = new ScrollableBox();
    scrollBox.region = new Region(Offset.ORIGIN, new Size(5, 5));
    app.activeScreen.appendChild(scrollBox);

    const child = new Widget("button");
    child.focusable = true;
    // Position child far below the viewport
    child.region = new Region(new Offset(0, 15), new Size(5, 1));
    scrollBox.appendChild(child);

    expect(scrollBox.scrollOffset.y).toBe(0);

    // Focus the child widget
    app.activeScreen.focusWidget(child);

    // Parent should automatically scroll down to bring y=15 into view
    // Since viewport height is 5 (v1=0, v2=5), child bottom is 16 (y2=16).
    // Scroll should adjust to at least y2 - v2 = 16 - 5 = 11.
    expect(scrollBox.scrollOffset.y).toBe(11);

    app.stop();
  });

  test("focusWidget({scroll:false}) leaves scrollOffset untouched", () => {
    const driver = new MockDriver(40, 20);
    const app = new App(driver);
    app.run();

    const scrollBox = new ScrollableBox();
    scrollBox.region = new Region(Offset.ORIGIN, new Size(5, 5));
    app.activeScreen.appendChild(scrollBox);

    const child = new Widget("button");
    child.focusable = true;
    child.region = new Region(new Offset(0, 15), new Size(5, 1));
    scrollBox.appendChild(child);

    // Pointer-driven focus must not scroll the viewport: the user clicked a cell
    // already on screen, so jerking content under the cursor (and any selection
    // anchor set on the same press) would be wrong.
    app.activeScreen.focusWidget(child, { scroll: false });
    expect(scrollBox.scrollOffset.y).toBe(0);
    expect(app.activeScreen.focusedWidget).toBe(child);

    app.stop();
  });

  test("Overflow styles override scrolling and scrollbar visibility", () => {
    const scrollBox = new ScrollableBox();
    scrollBox.region = new Region(Offset.ORIGIN, new Size(5, 5));
    // Set overflowY to "hidden"
    scrollBox.computedStyle.overflowY = "hidden";

    const child = new Widget("label");
    child.region = new Region(Offset.ORIGIN, new Size(10, 10));
    scrollBox.appendChild(child);

    // Try scrolling down
    const scrollDownEv: any = { x: 2, y: 2, type: "scroll_down", button: "none", handled: false };
    scrollBox.handleScroll(scrollDownEv);
    // Should NOT scroll because overflowY is hidden
    expect(scrollDownEv.handled).toBe(false);
    expect(scrollBox.scrollOffset.y).toBe(0);

    // Verify scrollbar visibility: overflowY: scroll shows scrollbar even without overflow
    const emptyScrollBox = new ScrollableBox();
    emptyScrollBox.region = new Region(Offset.ORIGIN, new Size(5, 5));
    emptyScrollBox.computedStyle.overflowY = "scroll";

    const buffer = new ScreenBuffer(10, 10);
    buffer.clear();
    emptyScrollBox.render(buffer);

    // Should draw vertical scrollbar tracker │ or thumb █ on the right border/edge (x=4)
    let hasScrollbarChar = false;
    for (let y = 0; y < 5; y++) {
      const char = buffer.cells[y][4].char;
      if (char === "░" || char === "█" || char === "│") {
        hasScrollbarChar = true;
      }
    }
    expect(hasScrollbarChar).toBe(true);
  });

  test("Scrollbar click, jump-scroll, and drag-scroll with active capture", async () => {
    const driver = new MockDriver(40, 20);
    const app = new App(driver);
    app.run();

    const scrollBox = new ScrollableBox();
    // 5x5 container, so content area is x=0..5, y=0..5
    // Vertical scrollbar track is at x = 4, y = 0..4
    scrollBox.style.position = "absolute";
    scrollBox.style.width = 5;
    scrollBox.style.height = 5;
    app.activeScreen.appendChild(scrollBox);

    const child = new Widget("label");
    // Size is 10x10, so scroll range is 0 to 5
    child.style.position = "absolute";
    child.style.width = 10;
    child.style.height = 10;
    scrollBox.appendChild(child);

    app.queueRender();

    // Initial scroll is 0
    expect(scrollBox.scrollOffset.y).toBe(0);

    // Wait for initial render
    await waitFor(() => scrollBox.region.width > 0);

    // 1. Click on the scrollbar track (say y=3, which is outside the y=0 thumb area)
    // This should trigger a jump-scroll!
    driver.simulateMouse(4, 3, "press", "left");
    await waitFor(() => scrollBox.scrollOffset.y > 0);
    expect(scrollBox.scrollOffset.y).toBeGreaterThan(0);

    // Save offset after jump
    const jumpY = scrollBox.scrollOffset.y;

    // 2. Drag the mouse up to y=1
    // Since mouse drag is captured by app.input.activeDragWidget, dragging anywhere should update the scrollbar
    driver.simulateMouse(4, 1, "drag", "left");
    await waitFor(() => scrollBox.scrollOffset.y < jumpY);
    expect(scrollBox.scrollOffset.y).toBeLessThan(jumpY);

    // 3. Release mouse
    driver.simulateMouse(4, 1, "release", "none");
    await flush(15);

    // Dragging mouse after release should not change scrollOffset
    const afterReleaseY = scrollBox.scrollOffset.y;
    driver.simulateMouse(4, 2, "drag", "left");
    await flush(15);
    expect(scrollBox.scrollOffset.y).toBe(afterReleaseY);

    app.stop();
  });

  test("Horizontal scrollbar click, jump-scroll, and drag-scroll with active capture", async () => {
    const driver = new MockDriver(40, 20);
    const app = new App(driver);
    app.run();

    const scrollBox = new ScrollableBox();
    // 5x5 container, so content area is x=0..5, y=0..5
    // Horizontal scrollbar track is at y = 4, x = 0..4
    scrollBox.style.position = "absolute";
    scrollBox.style.width = 5;
    scrollBox.style.height = 5;
    app.activeScreen.appendChild(scrollBox);

    const child = new Widget("label");
    // Size is 10x10, so scroll range is 0 to 5
    child.style.position = "absolute";
    child.style.width = 10;
    child.style.height = 10;
    scrollBox.appendChild(child);

    app.queueRender();

    // Initial scroll is 0
    expect(scrollBox.scrollOffset.x).toBe(0);

    // Wait for initial render
    await waitFor(() => scrollBox.region.width > 0);

    // 1. Click on the scrollbar track (say x=3, which is outside the x=0 thumb area)
    // This should trigger a jump-scroll!
    driver.simulateMouse(3, 4, "press", "left");
    await waitFor(() => scrollBox.scrollOffset.x > 0);
    expect(scrollBox.scrollOffset.x).toBeGreaterThan(0);

    // Save offset after jump
    const jumpX = scrollBox.scrollOffset.x;

    // 2. Drag the mouse left to x=1
    // Since mouse drag is captured by app.input.activeDragWidget, dragging anywhere should update the scrollbar
    driver.simulateMouse(1, 4, "drag", "left");
    await waitFor(() => scrollBox.scrollOffset.x < jumpX);
    expect(scrollBox.scrollOffset.x).toBeLessThan(jumpX);

    // 3. Release mouse
    driver.simulateMouse(1, 4, "release", "none");
    await flush(15);

    // Dragging mouse after release should not change scrollOffset
    const afterReleaseX = scrollBox.scrollOffset.x;
    driver.simulateMouse(2, 4, "drag", "left");
    await flush(15);
    expect(scrollBox.scrollOffset.x).toBe(afterReleaseX);

    app.stop();
  });

  test("dragging the scrollbar thumb unpins followTail so render() doesn't snap back", () => {
    // Regression: handleMouse's scrollbar press/drag paths never cleared
    // tailPinned, so a followTail box (e.g. a streaming log) fought the drag —
    // render() re-pinned to the bottom every frame, and the thumb never moved.
    const scrollBox = new ScrollableBox();
    scrollBox.followTail = true;
    // 5x5 container; content is 10 tall -> maxScrollY = 5.
    scrollBox.region = new Region(Offset.ORIGIN, new Size(5, 5));
    const child = new Widget("label");
    child.region = new Region(Offset.ORIGIN, new Size(10, 10));
    scrollBox.appendChild(child);

    // Start pinned to the bottom, as followTail content normally is.
    scrollBox.render(new ScreenBuffer(5, 5)); // let followTail pin it itself
    const bottom = scrollBox.scrollOffset.y;
    expect(bottom).toBeGreaterThan(0);

    // Press directly on the track above the thumb (jump-scroll away from the bottom).
    const press: any = { x: 4, y: 0, type: "press", button: "left", handled: false };
    scrollBox.handleMouse(press);
    expect(press.handled).toBe(true);
    expect(scrollBox.scrollOffset.y).toBeLessThan(bottom);
    const afterPress = scrollBox.scrollOffset.y;

    // render() must not snap the offset back to the bottom now that the user
    // has actively dragged away from it.
    scrollBox.render(new ScreenBuffer(5, 5));
    expect(scrollBox.scrollOffset.y).toBe(afterPress);

    // A subsequent drag further up should likewise stick.
    const drag: any = { x: 4, y: 1, type: "drag", button: "left", handled: false };
    scrollBox.handleMouse(drag);
    const afterDrag = scrollBox.scrollOffset.y;
    scrollBox.render(new ScreenBuffer(5, 5));
    expect(scrollBox.scrollOffset.y).toBe(afterDrag); // no snap-back
    expect(scrollBox.scrollOffset.y).toBeLessThan(bottom);
  });
});
