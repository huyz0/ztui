import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { App } from "../../../core/app.ts";
import { GalleryView } from "../../../react.ts";
import { mountApp } from "../../../test/harness.tsx";

type Mounted = Awaited<ReturnType<typeof mountApp>>;

// Enough items to overflow the test viewport (the App floors the screen to
// 80×24, so the grid needs many rows to scroll).
const ITEMS = Array.from({ length: 100 }, (_, i) => i);

function renderItem(n: number) {
  return `item-${n}`;
}

/** The inner scroll box (the gallery's grid container). */
function findBox(t: Mounted): any {
  let found: any;
  t.screen.walk((n: any) => {
    if (n.constructor?.name === "ScrollableBoxWidget") found = n;
  });
  if (!found) throw new Error("ScrollableBoxWidget not found");
  return found;
}

/** Cells in the first row == current column count. */
function columnCount(t: Mounted): number {
  const box = findBox(t);
  return box.children[0]?.children.length ?? 0;
}

function expectedColumns(width: number, itemWidth: number, gap = 1): number {
  return Math.max(1, Math.floor((width + gap) / (itemWidth + gap)));
}

describe("GalleryView", () => {
  test("derives the column count from the container width", async () => {
    const t = await mountApp(
      <GalleryView
        items={ITEMS}
        renderItem={renderItem}
        itemWidth={10}
        itemHeight={3}
        style={{ height: "100%" }}
      />,
      { cols: 64, rows: 16 },
    );
    await t.settle(20);
    const box = findBox(t);
    const cols = columnCount(t);
    expect(cols).toBe(expectedColumns(box.getContentRect().width, 10));
    expect(cols).toBeGreaterThan(1);
  });

  test("reflows the columns when the terminal resizes", async () => {
    const t = await mountApp(
      <GalleryView
        items={ITEMS}
        renderItem={renderItem}
        itemWidth={10}
        itemHeight={3}
        style={{ height: "100%" }}
      />,
      { cols: 88, rows: 16 },
    );
    await t.settle(20);
    const narrow = columnCount(t);

    t.driver.simulateResize(132, 24);
    await t.settle(80); // past the App's 30ms resize debounce + the gallery's re-measure
    const wide = columnCount(t);

    expect(wide).toBeGreaterThan(narrow);
    expect(wide).toBe(expectedColumns(findBox(t).getContentRect().width, 10));
  });

  test("retries auto-measurement while the box reports zero width, then gives up after the cap", async () => {
    const t = await mountApp(
      <GalleryView
        items={ITEMS}
        renderItem={renderItem}
        itemWidth={10}
        itemHeight={3}
        style={{ height: "100%" }}
      />,
      { cols: 64, rows: 16 },
    );
    await t.settle(20);
    const before = columnCount(t);
    expect(before).toBeGreaterThan(1);

    // Force the width measurement to read zero, then trigger a re-render (via
    // resize) so the auto-column effect re-runs against it — it should retry
    // on a short timer instead of collapsing back to 1 column immediately.
    const box = findBox(t);
    const realGetContentRect = box.getContentRect.bind(box);
    box.getContentRect = () => ({ width: 0, height: 0 });
    t.driver.simulateResize(90, 16);
    // Past the App's resize debounce (30ms) + all 30 16ms measurement retries
    // (the cap), so the effect gives up instead of retrying forever.
    await t.settle(1200);
    // Still reporting the last good column count — a zero-width read doesn't
    // reset autoColumns back to the 1-column fallback.
    expect(columnCount(t)).toBe(before);

    // Restore the real measurement and let it recover on the next re-render.
    box.getContentRect = realGetContentRect;
    t.driver.simulateResize(64, 16);
    await t.settle(200);
    expect(columnCount(t)).toBe(before);
  });

  test("auto-column measurement falls back to zero when width is missing entirely", async () => {
    // Regression coverage for `boxRef.current?.getContentRect?.().width ?? 0`:
    // the existing zero-width retry test stubs an explicit `width: 0`, which
    // is a defined value and never exercises the `??` fallback itself. Stub a
    // rect with no `width` key at all so the fallback kicks in.
    const t = await mountApp(
      <GalleryView
        items={ITEMS}
        renderItem={renderItem}
        itemWidth={10}
        itemHeight={3}
        style={{ height: "100%" }}
      />,
      { cols: 64, rows: 16 },
    );
    await t.settle(20);
    const before = columnCount(t);
    expect(before).toBeGreaterThan(1);

    const box = findBox(t);
    const realGetContentRect = box.getContentRect.bind(box);
    box.getContentRect = () => ({ height: 12 }) as any;
    t.driver.simulateResize(90, 16);
    await t.settle(80);
    // Still 1+ columns from before — a missing width falls back to 0, taking
    // the same retry path as an explicit zero.
    expect(columnCount(t)).toBe(before);

    box.getContentRect = realGetContentRect;
    t.driver.simulateResize(64, 16);
    await t.settle(80);
    expect(columnCount(t)).toBe(before);
  });

  test("respects an explicit columns override", async () => {
    const t = await mountApp(
      <GalleryView
        items={ITEMS}
        renderItem={renderItem}
        itemWidth={10}
        itemHeight={3}
        columns={2}
        style={{ height: "100%" }}
      />,
      { cols: 80, rows: 16 },
    );
    await t.settle(20);
    expect(columnCount(t)).toBe(2);
  });

  test("arrows move the cursor in 2D (±1 across, ±columns down)", async () => {
    const onSelect = vi.fn();
    const t = await mountApp(
      <GalleryView
        items={ITEMS}
        renderItem={renderItem}
        itemWidth={10}
        itemHeight={3}
        onSelect={onSelect}
        style={{ height: "100%" }}
      />,
      { cols: 64, rows: 16 },
    );
    await t.settle(20);
    const cols = columnCount(t);
    const wrapper = findBox(t).parent; // the focusable gallery wrapper

    // Settle between presses so each handler closes over the updated cursor.
    wrapper.handleKey({ name: "right" });
    await t.settle();
    expect(onSelect).toHaveBeenLastCalledWith(1);
    wrapper.handleKey({ name: "down" });
    await t.settle();
    expect(onSelect).toHaveBeenLastCalledWith(1 + cols);
    wrapper.handleKey({ name: "up" });
    await t.settle();
    expect(onSelect).toHaveBeenLastCalledWith(1);
    wrapper.handleKey({ name: "end" });
    await t.settle();
    expect(onSelect).toHaveBeenLastCalledWith(ITEMS.length - 1);
  });

  test("Enter activates the cursor item", async () => {
    const onActivate = vi.fn();
    const t = await mountApp(
      <GalleryView
        items={ITEMS}
        renderItem={renderItem}
        itemWidth={10}
        itemHeight={3}
        defaultSelectedIndex={3}
        onActivate={onActivate}
        style={{ height: "100%" }}
      />,
      { cols: 64, rows: 16 },
    );
    await t.settle(20);
    findBox(t).parent.handleKey({ name: "enter" });
    expect(onActivate).toHaveBeenCalledWith(3);
  });

  test("moving to an off-screen row scrolls it into view", async () => {
    const t = await mountApp(
      <GalleryView
        items={ITEMS}
        renderItem={renderItem}
        itemWidth={10}
        itemHeight={3}
        style={{ height: "100%" }}
      />,
      { cols: 64, rows: 12 },
    );
    await t.settle(20);
    const box = findBox(t);
    expect(box.scrollOffset.y).toBe(0);
    box.parent.handleKey({ name: "end" }); // jump to the last item
    await t.settle(20);
    expect(box.scrollOffset.y).toBeGreaterThan(0);
  });

  test("scrolling into view falls back to zero when the box has no scrollOffset yet", async () => {
    // Regression coverage: `box.scrollOffset?.y ?? 0` / `?.x ?? 0` must not
    // throw when the ScrollableBox hasn't reported a scroll offset yet — the
    // ensure-visible effect should treat that as (0, 0) and still scroll.
    //
    // Stub getContentRect first (as the auto-measure retry test above does):
    // the real ScrollableBox implementation reads `this.scrollOffset` to
    // compute content size, so it can't be called while scrollOffset is
    // undefined without throwing.
    const t = await mountApp(
      <GalleryView
        items={ITEMS}
        renderItem={renderItem}
        itemWidth={10}
        itemHeight={3}
        style={{ height: "100%" }}
      />,
      { cols: 64, rows: 12 },
    );
    await t.settle(20);
    const box = findBox(t);
    const rect = box.getContentRect();
    box.getContentRect = () => rect;
    box.scrollOffset = undefined;
    box.parent.handleKey({ name: "end" }); // jump to the last item, off-screen
    await t.settle(20);
    expect(box.scrollOffset.y).toBeGreaterThan(0);
    expect(box.scrollOffset.x).toBe(0);
  });

  test("scrolling into view skips queueRender when there's no live App instance", async () => {
    // The ensure-visible effect calls `App.instance?.queueRender(...)` — with
    // no live App, it must skip that call instead of throwing.
    const t = await mountApp(
      <GalleryView
        items={ITEMS}
        renderItem={renderItem}
        itemWidth={10}
        itemHeight={3}
        style={{ height: "100%" }}
      />,
      { cols: 64, rows: 12 },
    );
    await t.settle(20);
    const box = findBox(t);
    const savedInstance = App.instance;
    App.instance = null;
    try {
      box.parent.handleKey({ name: "end" }); // jump to the last item, off-screen
      await t.settle(20);
      expect(box.scrollOffset.y).toBeGreaterThan(0);
    } finally {
      App.instance = savedInstance;
    }
  });

  test("focusSelf is a no-op when the scroll box has no parent wrapper", async () => {
    // `focusSelf` reads `boxRef.current?.parent` and only focuses when that's
    // truthy — cover the falsy branch (e.g. a mousedown racing unmount).
    const t = await mountApp(
      <GalleryView
        items={ITEMS}
        renderItem={renderItem}
        itemWidth={10}
        itemHeight={3}
        style={{ height: "100%" }}
      />,
      { cols: 64, rows: 16 },
    );
    await t.settle(20);
    const box = findBox(t);
    const wrapper = box.parent;
    expect(t.screen.focusedWidget).not.toBe(wrapper);

    // Invoke the wrapper's onMouseDown handler (focusSelf) directly rather
    // than through hit-test bubbling: bubbling itself walks widgets' `.parent`
    // pointers, so nulling `box.parent` to reach the branch would also break
    // delivery of the event to the wrapper's handler.
    const savedParent = box.parent;
    box.parent = null;
    try {
      expect(() => wrapper.onMouseDown?.({} as any)).not.toThrow();
      await t.settle();
      expect(t.screen.focusedWidget).not.toBe(wrapper);
    } finally {
      box.parent = savedParent;
    }
  });

  test("scrolling into view falls back to a zero viewport height when it's missing", async () => {
    // Regression coverage for `box.getContentRect?.().height ?? 0` in the
    // ensure-visible effect — stub a rect with no `height` key so the `??`
    // fallback (rather than a defined `0`) is what's exercised.
    const t = await mountApp(
      <GalleryView
        items={ITEMS}
        renderItem={renderItem}
        itemWidth={10}
        itemHeight={3}
        style={{ height: "100%" }}
      />,
      { cols: 64, rows: 12 },
    );
    await t.settle(20);
    const box = findBox(t);
    const realGetContentRect = box.getContentRect.bind(box);
    const rect = realGetContentRect();
    box.getContentRect = () => ({ width: rect.width }) as any;
    box.parent.handleKey({ name: "end" }); // jump to the last item, off-screen
    await t.settle(20);
    box.getContentRect = realGetContentRect;
    // With viewH treated as 0, the row-top bound alone drives the scroll —
    // still moves the view down to reveal the last row.
    expect(box.scrollOffset.y).toBeGreaterThan(0);
  });

  test("page step falls back to one row's stride when the viewport height is missing", async () => {
    // Regression coverage for `boxRef.current?.getContentRect?.().height ?? rowStride`
    // in `pageStep` — stub a rect with no `height` key.
    const onSelect = vi.fn();
    const t = await mountApp(
      <GalleryView
        items={ITEMS}
        renderItem={renderItem}
        itemWidth={10}
        itemHeight={3}
        onSelect={onSelect}
        style={{ height: "100%" }}
      />,
      { cols: 64, rows: 16 },
    );
    await t.settle(20);
    const box = findBox(t);
    const cols = columnCount(t);
    const realGetContentRect = box.getContentRect.bind(box);
    box.getContentRect = () => ({ width: realGetContentRect().width }) as any;
    try {
      box.parent.handleKey({ name: "pagedown" });
      await t.settle();
      // viewH falls back to rowStride, so floor(rowStride / rowStride) === 1:
      // exactly one row's worth of cells (`columns`).
      expect(onSelect).toHaveBeenLastCalledWith(cols);
    } finally {
      box.getContentRect = realGetContentRect;
    }
  });

  test("mouse wheel scrolls the grid", async () => {
    const t = await mountApp(
      <GalleryView
        items={ITEMS}
        renderItem={renderItem}
        itemWidth={10}
        itemHeight={3}
        style={{ height: "100%" }}
      />,
      { cols: 64, rows: 12 },
    );
    await t.settle(20);
    const box = findBox(t);
    const c = box.getContentRect();
    t.driver.simulateMouse(c.x + 2, c.y + 2, "scroll_down", "none");
    await t.settle();
    expect(box.scrollOffset.y).toBeGreaterThan(0);
  });

  test("is focusable: arrows route to it through the focus chain", async () => {
    const onSelect = vi.fn();
    const t = await mountApp(
      <GalleryView
        items={ITEMS}
        renderItem={renderItem}
        itemWidth={10}
        itemHeight={3}
        onSelect={onSelect}
        style={{ height: "100%" }}
      />,
      { cols: 64, rows: 16 },
    );
    await t.settle(20);
    const wrapper = findBox(t).parent;
    expect(wrapper.focusable).toBe(true);

    t.screen.focusWidget(wrapper);
    t.driver.simulateKey("right", "right"); // dispatched to the focused widget
    await t.settle();
    expect(onSelect).toHaveBeenLastCalledWith(1);
  });

  test("clicking a cell focuses the gallery so the keyboard takes over", async () => {
    const t = await mountApp(
      <GalleryView
        items={ITEMS}
        renderItem={renderItem}
        itemWidth={10}
        itemHeight={3}
        style={{ height: "100%" }}
      />,
      { cols: 64, rows: 16 },
    );
    await t.settle(20);
    const box = findBox(t);
    const wrapper = box.parent;
    expect(t.screen.focusedWidget).not.toBe(wrapper);

    const cell = box.children[0].children[1]; // second cell of the first row
    const r = cell.region;
    t.driver.simulateMouse(r.x + 1, r.y + 1, "press", "left");
    await t.settle();
    expect(t.screen.focusedWidget).toBe(wrapper);
  });

  test("Left/Home/PageUp/PageDown move the cursor; an unrecognized key is ignored", async () => {
    const onSelect = vi.fn();
    const t = await mountApp(
      <GalleryView
        items={ITEMS}
        renderItem={renderItem}
        itemWidth={10}
        itemHeight={3}
        defaultSelectedIndex={20}
        onSelect={onSelect}
        style={{ height: "100%" }}
      />,
      { cols: 64, rows: 16 },
    );
    await t.settle(20);
    const wrapper = findBox(t).parent;

    wrapper.handleKey({ name: "left" });
    await t.settle();
    expect(onSelect).toHaveBeenLastCalledWith(19);

    wrapper.handleKey({ name: "home" });
    await t.settle();
    expect(onSelect).toHaveBeenLastCalledWith(0);

    wrapper.handleKey({ name: "pagedown" });
    await t.settle();
    const afterPageDown = onSelect.mock.calls.at(-1)?.[0];
    expect(afterPageDown).toBeGreaterThan(0);

    wrapper.handleKey({ name: "pageup" });
    await t.settle();
    expect(onSelect).toHaveBeenLastCalledWith(0); // pageup from near the top clamps to 0

    onSelect.mockClear();
    wrapper.handleKey({ name: "tab" }); // no case matches -> ignored
    await t.settle();
    expect(onSelect).not.toHaveBeenCalled();
  });

  test("an event with no `name` falls back to `key` for navigation", async () => {
    const onSelect = vi.fn();
    const t = await mountApp(
      <GalleryView
        items={ITEMS}
        renderItem={renderItem}
        itemWidth={10}
        itemHeight={3}
        onSelect={onSelect}
        style={{ height: "100%" }}
      />,
      { cols: 64, rows: 16 },
    );
    await t.settle(20);
    const wrapper = findBox(t).parent;
    wrapper.handleKey({ key: "right" }); // no `name` field at all
    await t.settle();
    expect(onSelect).toHaveBeenLastCalledWith(1);
  });

  test("Enter on an empty gallery does not activate", async () => {
    const onActivate = vi.fn();
    const t = await mountApp(
      <GalleryView
        items={[] as number[]}
        renderItem={renderItem}
        itemWidth={10}
        itemHeight={3}
        onActivate={onActivate}
        style={{ height: "100%" }}
      />,
      { cols: 64, rows: 16 },
    );
    await t.settle(20);
    findBox(t).parent.handleKey({ name: "enter" });
    expect(onActivate).not.toHaveBeenCalled();
  });

  test("double-clicking a cell activates it", async () => {
    const onActivate = vi.fn();
    const t = await mountApp(
      <GalleryView
        items={ITEMS}
        renderItem={renderItem}
        itemWidth={10}
        itemHeight={3}
        onActivate={onActivate}
        style={{ height: "100%" }}
      />,
      { cols: 64, rows: 16 },
    );
    await t.settle(20);
    const box = findBox(t);
    const cell = box.children[0].children[1]; // second cell of the first row
    const r = cell.region;
    t.driver.simulateMouse(r.x + 1, r.y + 1, "press", "left");
    await t.settle();
    t.driver.simulateMouse(r.x + 1, r.y + 1, "press", "left"); // within DOUBLE_CLICK_MS
    await t.settle();
    expect(onActivate).toHaveBeenCalledWith(1);
  });

  test("a controlled selectedIndex is used as-is (no internal state update)", async () => {
    const onSelect = vi.fn();
    function Controlled() {
      const [sel, setSel] = useState(0);
      return (
        <GalleryView
          items={ITEMS}
          renderItem={renderItem}
          itemWidth={10}
          itemHeight={3}
          selectedIndex={sel}
          onSelect={(i) => {
            onSelect(i);
            setSel(i);
          }}
          style={{ height: "100%" }}
        />
      );
    }
    const t = await mountApp(<Controlled />, { cols: 64, rows: 16 });
    await t.settle(20);
    const wrapper = findBox(t).parent;
    wrapper.handleKey({ name: "right" });
    await t.settle();
    expect(onSelect).toHaveBeenLastCalledWith(1);
  });

  test("cursor clamps to the new last item when items shrinks out from under an uncontrolled selection", async () => {
    // Regression: `sel` was `selectedIndex ?? internalSel` with no clamp, so
    // moving the cursor to the end of a 100-item list and then swapping in a
    // shorter list left `internalSel` past the end. That broke the
    // selected-cell highlight and would hand onActivate an out-of-bounds index.
    const shrinkTrigger: { current: (() => void) | null } = { current: null };
    function Swapper({ onActivate }: { onActivate: (i: number) => void }) {
      const [shrunk, setShrunk] = useState(false);
      shrinkTrigger.current = () => setShrunk(true);
      return (
        <GalleryView
          items={shrunk ? ITEMS.slice(0, 5) : ITEMS}
          renderItem={renderItem}
          itemWidth={10}
          itemHeight={3}
          onActivate={onActivate}
          style={{ height: "100%" }}
        />
      );
    }
    const onActivate = vi.fn();
    const t = await mountApp(<Swapper onActivate={onActivate} />, { cols: 64, rows: 16 });
    await t.settle(20);
    const wrapper = findBox(t).parent;
    wrapper.handleKey({ name: "end" }); // cursor -> 99
    await t.settle();

    shrinkTrigger.current?.();
    await t.settle(20);

    wrapper.handleKey({ name: "enter" });
    await t.settle();
    // Without the clamp, onActivate would fire with the stale index 99 —
    // out of bounds for the now-5-item list.
    expect(onActivate).toHaveBeenCalledWith(4);
  });
});
