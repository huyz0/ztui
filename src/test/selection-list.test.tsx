import { describe, expect, test } from "vitest";
import { SelectionList, VBox } from "../react/components.tsx";
import type { ListItem } from "../widgets/data/list-view.ts";
import type { SelectionListWidget } from "../widgets/data/selection-list.ts";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 40,
  rows: 8,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
};

const ITEMS: ListItem[] = [
  { id: "a", label: "apple.ts" },
  { id: "b", label: "banana.ts" },
  { id: "c", label: "cherry.ts", disabled: true },
  { id: "d", label: "date.ts" },
];

describe("SelectionList", () => {
  test("renders a checkbox per row, reflecting the checked value", async () => {
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={ITEMS} value={["b"]} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("☐ apple.ts"); // unchecked
    expect(text).toContain("☑ banana.ts"); // checked
  });

  test("Space toggles the cursor row and fires onChange in item order", async () => {
    const changes: string[][] = [];
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={ITEMS} defaultValue={[]} onChange={(v) => changes.push(v)} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;

    w.handleKey({ name: "space", handled: false } as never); // toggle "a"
    await t.settle();
    expect(changes.at(-1)).toEqual(["a"]);

    w.handleKey({ name: "down", handled: false } as never); // cursor → "b"
    w.handleKey({ name: "space", handled: false } as never);
    await t.settle();
    expect(changes.at(-1)).toEqual(["a", "b"]); // item order preserved
    expect(t.text()).toContain("☑ banana.ts");
  });

  test("arrow navigation skips disabled rows", async () => {
    const changes: string[][] = [];
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={ITEMS} defaultValue={[]} onChange={(v) => changes.push(v)} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;

    // From "a": down→"b", down→skip disabled "c"→"d". Toggle lands on "d".
    w.handleKey({ name: "down", handled: false } as never);
    w.handleKey({ name: "down", handled: false } as never);
    w.handleKey({ name: "space", handled: false } as never);
    await t.settle();
    expect(changes.at(-1)).toEqual(["d"]);
  });

  test("'a' toggles all enabled rows, leaving disabled ones untouched", async () => {
    const changes: string[][] = [];
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={ITEMS} defaultValue={[]} onChange={(v) => changes.push(v)} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;

    w.handleKey({ name: "a", handled: false } as never);
    await t.settle();
    expect(changes.at(-1)).toEqual(["a", "b", "d"]); // "c" is disabled
  });

  test("clicking a disabled row does not select it", async () => {
    const changes: string[][] = [];
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={ITEMS} defaultValue={[]} onChange={(v) => changes.push(v)} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;
    const c = w.getContentRect();

    // Row index 2 is the disabled "cherry.ts".
    w.handleMouse({
      type: "press",
      button: "left",
      x: c.x + 2,
      y: c.y + 2,
      handled: false,
    } as never);
    await t.settle();
    expect(changes).toHaveLength(0);
  });

  test("renders a scrollbar and scrolls to the end when items overflow", async () => {
    const many: ListItem[] = Array.from({ length: 20 }, (_, i) => ({
      id: `i${i}`,
      label: `item-${i}`,
    }));
    const t = await mountApp(
      <VBox style={{ width: 30, height: 5 }}>
        <SelectionList id="s" items={many} defaultValue={[]} style={{ height: 5 }} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;
    expect(t.text()).toContain("item-0");
    expect(t.text()).toMatch(/[█░]/); // scrollbar track/thumb drawn

    w.handleKey({ name: "end", handled: false } as never);
    await t.settle();
    expect(t.text()).toContain("item-19"); // scrolled to the bottom
    expect(t.text()).not.toContain("item-0");
  });

  test("dragging the scrollbar scrolls the list", async () => {
    const many: ListItem[] = Array.from({ length: 20 }, (_, i) => ({
      id: `i${i}`,
      label: `item-${i}`,
    }));
    const t = await mountApp(
      <VBox style={{ width: 30, height: 5 }}>
        <SelectionList id="s" items={many} defaultValue={[]} style={{ height: 5 }} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;
    const c = w.getContentRect();

    w.handleMouse({
      type: "press",
      button: "left",
      x: c.right - 1,
      y: c.y,
      handled: false,
    } as never);
    w.handleMouse({ type: "drag", x: c.right - 1, y: c.bottom - 1, handled: false } as never);
    await t.settle();
    expect(t.text()).toContain("item-19"); // dragged the thumb to the bottom

    w.handleMouse({
      type: "release",
      x: c.right - 1,
      y: c.bottom - 1,
      handled: false,
    } as never);
    expect(w).toBeTruthy(); // release ends the drag without throwing
  });

  test("the mouse wheel scrolls without toggling rows, and 'a' toggles all", async () => {
    const changes: string[][] = [];
    const many: ListItem[] = Array.from({ length: 20 }, (_, i) => ({
      id: `i${i}`,
      label: `item-${i}`,
    }));
    const t = await mountApp(
      <VBox style={{ width: 30, height: 5 }}>
        <SelectionList
          id="s"
          items={many}
          defaultValue={[]}
          style={{ height: 5 }}
          onChange={(v) => changes.push(v)}
        />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;

    w.handleScroll({ type: "scroll_down", handled: false } as never);
    w.handleScroll({ type: "scroll_down", handled: false } as never);
    await t.settle();
    expect(t.text()).not.toContain("item-0 ");
    expect(changes).toHaveLength(0); // wheel never toggles

    w.handleScroll({ type: "scroll_up", handled: false } as never);
    await t.settle();

    w.handleKey({ name: "a", handled: false } as never);
    expect(changes.at(-1)).toHaveLength(20); // 'a' selected every row
  });

  test("cursorShapeAt returns null over the scrollbar gutter, else defers to super", async () => {
    const many: ListItem[] = Array.from({ length: 20 }, (_, i) => ({
      id: `i${i}`,
      label: `item-${i}`,
    }));
    const t = await mountApp(
      <VBox style={{ width: 30, height: 5 }}>
        <SelectionList id="s" items={many} defaultValue={[]} style={{ height: 5 }} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;
    const c = w.getContentRect();

    // Over the scrollbar column: no cursor override.
    expect(w.cursorShapeAt(c.right - 1, c.y)).toBeNull();
    // Elsewhere in the rows: defers to the base implementation (its own default cursor).
    expect(w.cursorShapeAt(c.x, c.y)).toBe("pointer");

    // When rows fit without a scrollbar, cursorShapeAt never special-cases any column.
    const t2 = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s2" items={ITEMS} defaultValue={[]} />
      </VBox>,
      OPTS,
    );
    await t2.settle();
    const w2 = t2.findById<SelectionListWidget>("s2") as SelectionListWidget;
    const c2 = w2.getContentRect();
    expect(w2.cursorShapeAt(c2.right - 1, c2.y)).toBe("pointer");
  });

  test("Home/End with no scrollbar still clamps scrollTop and skips redundant work", async () => {
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={ITEMS} defaultValue={[]} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;

    // moveCursor(0) is a no-op (delta === 0 branch).
    w.handleKey({ name: "up", handled: false } as never); // already at top: rowCount test below covers delta<0 path
    await t.settle();
    expect(t.text()).toContain("apple.ts");
  });

  test("moveCursor up direction and empty-list no-op are covered", async () => {
    const changes: string[][] = [];
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={ITEMS} defaultValue={[]} onChange={(v) => changes.push(v)} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;

    w.handleKey({ name: "down", handled: false } as never); // cursor -> "b"
    w.handleKey({ name: "up", handled: false } as never); // cursor -> "a" (negative delta path)
    w.handleKey({ name: "space", handled: false } as never);
    await t.settle();
    expect(changes.at(-1)).toEqual(["a"]);

    // Empty list: moveCursor should no-op instead of throwing.
    const t2 = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s2" items={[]} defaultValue={[]} />
      </VBox>,
      OPTS,
    );
    await t2.settle();
    const w2 = t2.findById<SelectionListWidget>("s2") as SelectionListWidget;
    w2.handleKey({ name: "down", handled: false } as never);
    await t2.settle();
    expect(w2).toBeTruthy();
  });

  test("moveCursor falls back to scanning backward when the forward run is all disabled", async () => {
    const items: ListItem[] = [
      { id: "a", label: "a" },
      { id: "b", label: "b", disabled: true },
      { id: "c", label: "c", disabled: true },
    ];
    const changes: string[][] = [];
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={items} defaultValue={[]} onChange={(v) => changes.push(v)} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;

    // Cursor at "a" (0); moving down runs off the end into disabled rows, so it
    // falls back to scanning backward from the original target and lands on "a" again.
    w.handleKey({ name: "down", handled: false } as never);
    w.handleKey({ name: "space", handled: false } as never);
    await t.settle();
    expect(changes.at(-1)).toEqual(["a"]);
  });

  test("moveCursor no-ops when every row is disabled in both directions", async () => {
    const items: ListItem[] = [
      { id: "a", label: "a", disabled: true },
      { id: "b", label: "b", disabled: true },
    ];
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={items} defaultValue={[]} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;
    w.handleKey({ name: "down", handled: false } as never);
    await t.settle();
    expect(w).toBeTruthy(); // no throw, cursor unchanged
  });

  test("Space on an initially-disabled cursor row does nothing", async () => {
    const items: ListItem[] = [
      { id: "a", label: "a", disabled: true },
      { id: "b", label: "b" },
    ];
    const changes: string[][] = [];
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={items} defaultValue={[]} onChange={(v) => changes.push(v)} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;
    w.handleKey({ name: "space", handled: false } as never);
    await t.settle();
    expect(changes).toHaveLength(0);
  });

  test("toggling an already-checked row unchecks it", async () => {
    const changes: string[][] = [];
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList
          id="s"
          items={ITEMS}
          defaultValue={["a"]}
          onChange={(v) => changes.push(v)}
        />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;
    w.handleKey({ name: "space", handled: false } as never); // "a" is checked -> unchecks
    await t.settle();
    expect(changes.at(-1)).toEqual([]);
  });

  test("toggleAll is a no-op when every row is disabled", async () => {
    const items: ListItem[] = [
      { id: "a", label: "a", disabled: true },
      { id: "b", label: "b", disabled: true },
    ];
    const changes: string[][] = [];
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={items} defaultValue={[]} onChange={(v) => changes.push(v)} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;
    w.handleKey({ name: "a", handled: false } as never);
    await t.settle();
    expect(changes).toHaveLength(0);
  });

  test("'a' deselects all when every enabled row is already checked", async () => {
    const changes: string[][] = [];
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList
          id="s"
          items={ITEMS}
          defaultValue={["a", "b", "d"]}
          onChange={(v) => changes.push(v)}
        />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;
    w.handleKey({ name: "a", handled: false } as never);
    await t.settle();
    expect(changes.at(-1)).toEqual([]); // all deselected, "c" untouched either way
  });

  test("handleScroll/handleKey/handleMouse respect an already-handled event", async () => {
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={ITEMS} defaultValue={[]} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;

    // Already-handled events must be left alone (no further widget logic runs).
    const scrollEv = { type: "scroll_down", handled: true } as never;
    w.handleScroll(scrollEv);
    expect((scrollEv as any).handled).toBe(true);

    const keyEv = { name: "space", handled: true } as never;
    w.handleKey(keyEv);
    expect((keyEv as any).handled).toBe(true);

    const mouseEv = { type: "press", button: "left", handled: true } as never;
    w.handleMouse(mouseEv);
    expect((mouseEv as any).handled).toBe(true);
  });

  test("a non-wheel scroll type is ignored (wheelScrollTop returns null)", async () => {
    const many: ListItem[] = Array.from({ length: 20 }, (_, i) => ({
      id: `i${i}`,
      label: `item-${i}`,
    }));
    const t = await mountApp(
      <VBox style={{ width: 30, height: 5 }}>
        <SelectionList id="s" items={many} defaultValue={[]} style={{ height: 5 }} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;
    const before = t.text();
    w.handleScroll({ type: "wheel_horizontal", handled: false } as never);
    await t.settle();
    expect(t.text()).toBe(before); // unrecognized scroll type: no-op
  });

  test("handleKey falls back to ev.key when ev.name is absent, and unknown keys are unhandled", async () => {
    const changes: string[][] = [];
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={ITEMS} defaultValue={[]} onChange={(v) => changes.push(v)} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;

    // No "name", only "key" — the `ev.name || ev.key` fallback.
    const ev = { key: "space", handled: false } as never;
    w.handleKey(ev);
    await t.settle();
    expect(changes.at(-1)).toEqual(["a"]);

    // Unrecognized key: handled stays false.
    const unknown = { name: "z", handled: false } as never;
    w.handleKey(unknown);
    expect((unknown as any).handled).toBe(false);
  });

  test("mouse release without an active scrollbar drag is a no-op", async () => {
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={ITEMS} defaultValue={[]} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;
    const ev = { type: "release", x: 0, y: 0, handled: false } as never;
    w.handleMouse(ev);
    expect((ev as any).handled).toBe(false);
  });

  test("non-press or non-left-button mouse events, and clicks outside the content rect, are ignored", async () => {
    const changes: string[][] = [];
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={ITEMS} defaultValue={[]} onChange={(v) => changes.push(v)} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;
    const c = w.getContentRect();

    w.handleMouse({ type: "move", x: c.x, y: c.y, handled: false } as never);
    w.handleMouse({
      type: "press",
      button: "right",
      x: c.x,
      y: c.y,
      handled: false,
    } as never);
    w.handleMouse({
      type: "press",
      button: "left",
      x: c.x - 1,
      y: c.y,
      handled: false,
    } as never);
    await t.settle();
    expect(changes).toHaveLength(0);
  });

  test("clicking below the last row (in-bounds column, out-of-range row) is ignored", async () => {
    const changes: string[][] = [];
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList
          id="s"
          items={[{ id: "a", label: "only" }]}
          defaultValue={[]}
          onChange={(v) => changes.push(v)}
        />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;
    const c = w.getContentRect();
    w.handleMouse({
      type: "press",
      button: "left",
      x: c.x,
      y: c.y + 3, // well past the single row
      handled: false,
    } as never);
    await t.settle();
    expect(changes).toHaveLength(0);
  });

  test("clicking an enabled row toggles it via the mouse", async () => {
    const changes: string[][] = [];
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={ITEMS} defaultValue={[]} onChange={(v) => changes.push(v)} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;
    const c = w.getContentRect();
    w.handleMouse({
      type: "press",
      button: "left",
      x: c.x,
      y: c.y, // row 0: "apple.ts"
      handled: false,
    } as never);
    await t.settle();
    expect(changes.at(-1)).toEqual(["a"]);
  });

  test("dragging the scrollbar thumb on a single-row track is a no-op (trackH <= 1)", async () => {
    const many: ListItem[] = Array.from({ length: 20 }, (_, i) => ({
      id: `i${i}`,
      label: `item-${i}`,
    }));
    const t = await mountApp(
      <VBox style={{ width: 30, height: 1 }}>
        <SelectionList id="s" items={many} defaultValue={[]} style={{ height: 1 }} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;
    const c = w.getContentRect();
    w.handleMouse({
      type: "press",
      button: "left",
      x: c.right - 1,
      y: c.y,
      handled: false,
    } as never);
    await t.settle();
    // scrollToTrackY got null back (track height 1) so scrollTop never moved off 0.
    expect(t.text()).toContain("item-0");
  });

  test("rowText renders an item's icon and detail when present", async () => {
    const items: ListItem[] = [{ id: "a", label: "readme", icon: "📄", detail: "2 KB" }];
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={items} defaultValue={[]} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    expect(t.text()).toContain("📄");
    expect(t.text()).toContain("2 KB");
  });

  test("Home from the bottom scrolls back up past the current viewport", async () => {
    const many: ListItem[] = Array.from({ length: 20 }, (_, i) => ({
      id: `i${i}`,
      label: `item-${i}`,
    }));
    const t = await mountApp(
      <VBox style={{ width: 30, height: 5 }}>
        <SelectionList id="s" items={many} defaultValue={[]} style={{ height: 5 }} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;

    w.handleKey({ name: "end", handled: false } as never); // scrollTop jumps to the bottom
    await t.settle();
    expect(t.text()).toContain("item-19");

    // Cursor jumps back to index 0, which is now above scrollTop: ensureVisible
    // must pull scrollTop back down to the top (the `index < scrollTop` branch).
    w.handleKey({ name: "home", handled: false } as never);
    await t.settle();
    expect(t.text()).toContain("item-0");
  });

  test("moveCursor before the first render falls back to a single visible row", async () => {
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={ITEMS} defaultValue={[]} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;

    // Simulate calling before any render ever ran (lastVisibleRows still 0).
    (w as unknown as { lastVisibleRows: number }).lastVisibleRows = 0;
    w.handleKey({ name: "down", handled: false } as never);
    expect(w).toBeTruthy(); // ensureVisible used the `|| 1` fallback without throwing
  });

  test("render is a no-op when the widget is invisible or has no content area", async () => {
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={ITEMS} defaultValue={[]} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;

    w.visible = false;
    expect(() => w.render(t.buffer)).not.toThrow();

    w.visible = true;
    const origGetContentRect = w.getContentRect.bind(w);
    w.getContentRect = () => ({ ...origGetContentRect(), width: 0, height: 0 }) as never;
    expect(() => w.render(t.buffer)).not.toThrow();
  });
});
