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
});
