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
import { TextNode } from "./text-node.ts";
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

  test("drawScrollFades is a no-op when overflowY doesn't scroll", () => {
    // Regression coverage: the early `if (!this.scrollableY) return;` guard —
    // with overflowY: hidden there's nothing to fade even if content overflows.
    const scrollBox = new ScrollableBox();
    scrollBox.computedStyle.overflowY = "hidden";
    scrollBox.region = new Region(Offset.ORIGIN, new Size(5, 5));
    const child = new Widget("label");
    child.region = new Region(Offset.ORIGIN, new Size(5, 20));
    child.render = (buf: ScreenBuffer) => {
      for (let y = 0; y < 5; y++)
        for (let x = 0; x < 5; x++) buf.setCell(x, y, "X", new Style({ color: "#ffffff" }));
    };
    scrollBox.appendChild(child);

    const buf = new ScreenBuffer(5, 5);
    scrollBox.render(buf);
    // No fade applied to the top row since scrolling is disabled on this axis.
    expect(buf.cells[0][0].style.color).toBe("#ffffff");
  });

  test("measure passes the real maxH (not the expanded scrollable bound) to children on a non-scrollable Y axis", () => {
    // Regression coverage: `childMaxH = this.scrollableY ? 10000 : maxH;` — when
    // overflowY is hidden, children must be measured against the real maxH, not
    // the expanded 10000 used for scrollable content.
    const scrollBox = new ScrollableBox();
    scrollBox.computedStyle.overflowY = "hidden";
    scrollBox.style.width = 10;
    scrollBox.style.height = 10;

    const child = new Widget("label");
    scrollBox.appendChild(child);

    const calls: Array<[number, number]> = [];
    const originalMeasure = child.measure.bind(child);
    child.measure = (mw: number, mh: number) => {
      calls.push([mw, mh]);
      originalMeasure(mw, mh);
    };

    scrollBox.measure(10, 10);

    // Width is still scrollable (default overflowX: auto) so it gets the
    // expanded 10000 bound; height is not scrollable, so it gets the real maxH.
    expect(calls[0]).toEqual([10000, 10]);
  });

  test("handleScroll and handleKey ignore events already handled by a child", () => {
    const scrollBox = new ScrollableBox();
    scrollBox.region = new Region(Offset.ORIGIN, new Size(5, 5));
    const child = new Widget("label");
    child.region = new Region(Offset.ORIGIN, new Size(10, 10));
    scrollBox.appendChild(child);

    const scrollEv: any = {
      x: 2,
      y: 2,
      type: "scroll_down",
      button: "none",
      handled: true, // already handled upstream (e.g. by a child)
    };
    scrollBox.handleScroll(scrollEv);
    expect(scrollBox.scrollOffset.y).toBe(0);

    const keyEv: any = {
      key: "down",
      name: "down",
      ctrl: false,
      meta: false,
      shift: false,
      handled: true,
    };
    scrollBox.handleKey(keyEv);
    expect(scrollBox.scrollOffset.y).toBe(0);
  });

  test("handleMouse ignores events already handled by a child", () => {
    const scrollBox = new ScrollableBox();
    scrollBox.region = new Region(Offset.ORIGIN, new Size(5, 5));
    const child = new Widget("label");
    child.region = new Region(Offset.ORIGIN, new Size(10, 10));
    scrollBox.appendChild(child);

    const pressEv: any = { x: 4, y: 0, type: "press", button: "left", handled: true };
    scrollBox.handleMouse(pressEv);
    // Nothing should have engaged the scrollbar drag state.
    expect((scrollBox as any).isDraggingY).toBe(false);
    expect(scrollBox.scrollOffset.y).toBe(0);
  });

  test("keyboard scrolling with followTail re-pins only once the bottom is reached", async () => {
    // Regression coverage for the followTail branch inside handleKey (mirrors
    // the mouse-drag/wheel followTail handling already covered elsewhere). Uses
    // a real App + layout pass so scrollOffset-dependent content sizing (which
    // assumes children are repositioned by layout each frame) stays accurate.
    const driver = new MockDriver(40, 20);
    const app = new App(driver);
    app.run();

    const scrollBox = new ScrollableBox();
    scrollBox.followTail = true;
    scrollBox.style.position = "absolute";
    scrollBox.style.width = 5;
    scrollBox.style.height = 5;
    app.activeScreen.appendChild(scrollBox);

    // Ten stacked rows of content — well past the 5-row viewport.
    for (let i = 0; i < 10; i++) {
      const row = new Widget("row");
      row.style.width = 5;
      row.style.height = 1;
      scrollBox.appendChild(row);
    }
    app.queueRender();
    app.activeScreen.focusWidget(scrollBox);

    // Wait for layout, then for the render loop to pin followTail to the bottom.
    await waitFor(() => scrollBox.region.width > 0);
    await waitFor(() => scrollBox.scrollOffset.y > 0);
    await flush(15);
    const bottom = scrollBox.scrollOffset.y;
    expect(bottom).toBeGreaterThan(0);
    expect((scrollBox as any).isAtBottom()).toBe(true);

    // Scroll up one row with the keyboard: no longer at the bottom, so
    // subsequent frames must NOT snap back down.
    driver.simulateKey("up", "up", false, false);
    await waitFor(() => scrollBox.scrollOffset.y === bottom - 1);
    await flush(15);
    expect(scrollBox.scrollOffset.y).toBe(bottom - 1);
    expect((scrollBox as any).isAtBottom()).toBe(false);

    // Scroll back down with the keyboard until the bottom is reached again —
    // this re-pins tailPinned.
    driver.simulateKey("down", "down", false, false);
    await waitFor(() => (scrollBox as any).isAtBottom());
    expect(scrollBox.scrollOffset.y).toBe(bottom);

    app.stop();
  });

  test("handleMouse treats an explicit border: none the same as borderless", () => {
    // Regression coverage for `hasBorder = !!computedStyle.border && border !== "none"`
    // — an explicit "none" must short-circuit to false, not stay truthy.
    const scrollBox = new ScrollableBox();
    scrollBox.computedStyle.border = "none";
    scrollBox.region = new Region(Offset.ORIGIN, new Size(5, 5));
    const child = new Widget("label");
    child.region = new Region(Offset.ORIGIN, new Size(10, 10));
    scrollBox.appendChild(child);

    // Same click used by the existing borderless jump-scroll test.
    const press: any = { x: 4, y: 3, type: "press", button: "left", handled: false };
    scrollBox.handleMouse(press);
    expect(press.handled).toBe(true);
    expect(scrollBox.scrollOffset.y).toBeGreaterThan(0);
  });

  test("pressing directly on the vertical/horizontal thumb starts a drag instead of jump-scrolling", () => {
    // Regression coverage for the `if (ev.y >= thumb.start && ev.y < thumb.start + thumb.size)`
    // branches in handleMouse — previously only the jump-scroll (click off the
    // thumb) path was exercised.
    const scrollBox = new ScrollableBox();
    scrollBox.region = new Region(Offset.ORIGIN, new Size(5, 5));
    const child = new Widget("label");
    child.region = new Region(Offset.ORIGIN, new Size(10, 10));
    scrollBox.appendChild(child);

    // Vertical track is at x=4, thumb spans y=0..1 at scrollOffset 0.
    const pressV: any = { x: 4, y: 0, type: "press", button: "left", handled: false };
    scrollBox.handleMouse(pressV);
    expect(pressV.handled).toBe(true);
    expect((scrollBox as any).isDraggingY).toBe(true);
    expect((scrollBox as any).dragStartOffset).toBe(0);
    // Clicking directly on the thumb doesn't jump-scroll.
    expect(scrollBox.scrollOffset.y).toBe(0);
    scrollBox.handleMouse({ x: 4, y: 0, type: "release", button: "none", handled: false } as any);

    // Horizontal track is at y=4, thumb spans x=0..1 at scrollOffset 0.
    const pressH: any = { x: 0, y: 4, type: "press", button: "left", handled: false };
    scrollBox.handleMouse(pressH);
    expect(pressH.handled).toBe(true);
    expect((scrollBox as any).isDraggingX).toBe(true);
    expect((scrollBox as any).dragStartOffset).toBe(0);
    expect(scrollBox.scrollOffset.x).toBe(0);
  });

  test("dragging with a thumb that fills the whole track doesn't move the offset (no divide-by-zero track room)", () => {
    // Regression coverage for the `vTrack.length > thumb.size ? ratio : 0` and
    // horizontal equivalent in the drag handler: when the thumb fills the
    // entire track (viewport nearly as tall/wide as content), there's no room
    // to drag, so the ratio must safely fall back to 0 rather than divide by
    // a zero/negative denominator.
    const scrollBox = new ScrollableBox();
    scrollBox.computedStyle.overflowX = "hidden";
    scrollBox.region = new Region(Offset.ORIGIN, new Size(5, 1));
    const child = new Widget("label");
    child.region = new Region(Offset.ORIGIN, new Size(5, 2));
    scrollBox.appendChild(child);

    // Force drag state directly (this thumb fills the whole 1-cell track, so
    // there's no distinct "off-thumb" click to start a drag through handleMouse).
    (scrollBox as any).isDraggingY = true;
    (scrollBox as any).dragStartOffset = 0;

    const drag: any = { x: 4, y: 0, type: "drag", button: "left", handled: false };
    scrollBox.handleMouse(drag);
    expect(drag.handled).toBe(true);
    expect(scrollBox.scrollOffset.y).toBe(0);

    // Horizontal counterpart: force isDraggingX with a thumb filling the track.
    const scrollBoxH = new ScrollableBox();
    scrollBoxH.computedStyle.overflowY = "hidden";
    scrollBoxH.region = new Region(Offset.ORIGIN, new Size(1, 5));
    const childH = new Widget("label");
    childH.region = new Region(Offset.ORIGIN, new Size(2, 5));
    scrollBoxH.appendChild(childH);
    (scrollBoxH as any).isDraggingX = true;
    (scrollBoxH as any).dragStartOffset = 0;
    const dragH: any = { x: 0, y: 4, type: "drag", button: "left", handled: false };
    scrollBoxH.handleMouse(dragH);
    expect(dragH.handled).toBe(true);
    expect(scrollBoxH.scrollOffset.x).toBe(0);
  });

  test("bordered scrollbars paint the non-thumb track with line glyphs", () => {
    // Regression coverage for the `else if (hasBorder)` branches in
    // drawScrollbars — previously only the borderless (space-filled) and
    // thumb-cell paths were exercised.
    const scrollBox = new ScrollableBox();
    scrollBox.computedStyle.border = "rounded";
    scrollBox.computedStyle.overflowY = "scroll";
    scrollBox.computedStyle.overflowX = "hidden";
    scrollBox.region = new Region(Offset.ORIGIN, new Size(8, 8));
    const child = new Widget("label");
    child.region = new Region(Offset.ORIGIN, new Size(6, 20));
    scrollBox.appendChild(child);

    const buffer = new ScreenBuffer(8, 8);
    buffer.clear();
    scrollBox.render(buffer);

    // Vertical track is at x=7 (client.right - 1), rows 1..6; thumb sits at
    // rows 1..2, so row 4 is a non-thumb track cell painted with the border glyph.
    expect(buffer.cells[4][7].char).toBe("│");

    // Horizontal counterpart: same geometry, transposed.
    const scrollBoxH = new ScrollableBox();
    scrollBoxH.computedStyle.border = "rounded";
    scrollBoxH.computedStyle.overflowX = "scroll";
    scrollBoxH.computedStyle.overflowY = "hidden";
    scrollBoxH.region = new Region(Offset.ORIGIN, new Size(8, 8));
    const childH = new Widget("label");
    childH.region = new Region(Offset.ORIGIN, new Size(20, 6));
    scrollBoxH.appendChild(childH);

    const bufferH = new ScreenBuffer(8, 8);
    bufferH.clear();
    scrollBoxH.render(bufferH);

    // Horizontal track is at y=7 (client.bottom - 1), columns 1..6; thumb sits
    // at columns 1..2, so column 4 is a non-thumb track cell.
    expect(bufferH.cells[7][4].char).toBe("─");
  });

  test("measure skips non-Widget and non-visible children", () => {
    // Regression coverage for `if (child instanceof Widget && child.visible)`
    // (and the plain `instanceof Widget` re-check in the second loop) —
    // previously only the "all children qualify" path was exercised.
    const scrollBox = new ScrollableBox();
    scrollBox.style.width = 10;
    scrollBox.style.height = 10;

    const hiddenChild = new Widget("label");
    hiddenChild.visible = false;
    hiddenChild.style.width = 20;
    hiddenChild.style.height = 20;
    scrollBox.appendChild(hiddenChild);

    const textNode = new TextNode("hi");
    scrollBox.appendChild(textNode as any);

    // Must not throw despite a non-Widget and an invisible child in the list.
    expect(() => scrollBox.measure(10, 10)).not.toThrow();
    // The invisible child was never measured with the expanded scrollable bound.
    expect(hiddenChild.measuredWidth).toBe(0);
  });

  test("handleKey is a no-op at scroll boundaries and for non-scrollable axes", () => {
    // Regression coverage for the (else-less) boundary guards in handleKey:
    // scrollableY/scrollableX false, and each directional guard already at its
    // limit (0 or max) so the inner `if` doesn't fire and `scrolled` stays false.
    const mk = (overrides: Partial<Record<string, string>> = {}) => {
      const box = new ScrollableBox();
      Object.assign(box.computedStyle, overrides);
      box.region = new Region(Offset.ORIGIN, new Size(5, 5));
      const child = new Widget("label");
      child.region = new Region(Offset.ORIGIN, new Size(10, 10));
      box.appendChild(child);
      return box;
    };
    const keyEv = (name: string): any => ({
      key: name,
      name,
      ctrl: false,
      meta: false,
      shift: false,
      handled: false,
    });

    // scrollableY false: up/down/pageup/pagedown never touch scrollOffset.y.
    const noY = mk({ overflowY: "hidden" });
    noY.handleKey(keyEv("down"));
    expect(noY.scrollOffset.y).toBe(0);

    // scrollableX false: left/right never touch scrollOffset.x.
    const noX = mk({ overflowX: "hidden" });
    noX.handleKey(keyEv("right"));
    expect(noX.scrollOffset.x).toBe(0);

    // Already at the top/left boundary: up/left/pageup are no-ops.
    const atStart = mk();
    atStart.handleKey(keyEv("up"));
    expect(atStart.scrollOffset.y).toBe(0);
    atStart.handleKey(keyEv("pageup"));
    expect(atStart.scrollOffset.y).toBe(0);
    atStart.handleKey(keyEv("left"));
    expect(atStart.scrollOffset.x).toBe(0);

    // Already at the bottom/right boundary: down/pagedown/right are no-ops.
    // Pin getContentSize to a fixed value so the boundary math (which normally
    // relies on layout re-shrinking child regions as scrollOffset changes,
    // not relevant to this synthetic no-layout test) stays stable across calls.
    const atEnd = mk();
    const contentRect = atEnd.getContentRect();
    const fixedContentSize = atEnd.getContentSize();
    atEnd.getContentSize = () => fixedContentSize;
    const maxY = fixedContentSize.height - contentRect.height;
    const maxX = fixedContentSize.width - contentRect.width;
    atEnd.scrollOffset = new Offset(maxX, maxY);
    atEnd.handleKey(keyEv("down"));
    expect(atEnd.scrollOffset.y).toBe(maxY);
    atEnd.handleKey(keyEv("pagedown"));
    expect(atEnd.scrollOffset.y).toBe(maxY);
    atEnd.handleKey(keyEv("right"));
    expect(atEnd.scrollOffset.x).toBe(maxX);

    // An unrecognized key touches neither axis, so `scrolled` stays false overall.
    const untouched = mk();
    const otherEv = keyEv("tab");
    untouched.handleKey(otherEv);
    expect(otherEv.handled).toBe(false);
    expect(untouched.scrollOffset.equals(Offset.ORIGIN)).toBe(true);
  });

  test("handleMouse ignores presses off any scrollbar track and releases while not dragging", () => {
    // Regression coverage: the press branch's final (no-op) alternate when the
    // click lands on neither the vertical nor horizontal track, the release
    // branch's condition being false for a non-mouse-drag event type, and the
    // release branch's inner guard when nothing was actually being dragged.
    const scrollBox = new ScrollableBox();
    scrollBox.region = new Region(Offset.ORIGIN, new Size(5, 5));
    const child = new Widget("label");
    child.region = new Region(Offset.ORIGIN, new Size(10, 10));
    scrollBox.appendChild(child);

    // A click in the middle of the content, away from either track.
    const midPress: any = { x: 1, y: 1, type: "press", button: "left", handled: false };
    scrollBox.handleMouse(midPress);
    expect(midPress.handled).toBe(false);
    expect((scrollBox as any).isDraggingY).toBe(false);
    expect((scrollBox as any).isDraggingX).toBe(false);

    // A mouse event type that matches none of press/drag/release.
    const moveEv: any = { x: 1, y: 1, type: "move", button: "none", handled: false };
    scrollBox.handleMouse(moveEv);
    expect(moveEv.handled).toBe(false);

    // A release while nothing is being dragged.
    const releaseEv: any = { x: 1, y: 1, type: "release", button: "none", handled: false };
    scrollBox.handleMouse(releaseEv);
    expect(releaseEv.handled).toBe(false);
  });
});
