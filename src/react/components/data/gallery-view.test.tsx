import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
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
