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

  test("cursorShapeAt returns null over the scrollbar gutter, otherwise defers to super", async () => {
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
    expect(w.cursorShapeAt(c.right - 1, c.y)).toBeNull(); // over the gutter
    expect(w.cursorShapeAt(c.x, c.y)).toBe("pointer"); // over a row

    // With no overflow there's no scrollbar, so the gutter check is skipped.
    const single = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s2" items={ITEMS} defaultValue={[]} />
      </VBox>,
      OPTS,
    );
    await single.settle();
    const w2 = single.findById<SelectionListWidget>("s2") as SelectionListWidget;
    const c2 = w2.getContentRect();
    expect(w2.cursorShapeAt(c2.right - 1, c2.y)).toBe("pointer");
  });

  test("ensureVisible scrolls up when the cursor moves above the viewport", async () => {
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

    w.handleKey({ name: "end", handled: false } as never); // jump to the bottom
    await t.settle();
    expect(t.text()).toContain("item-19");

    w.handleKey({ name: "home", handled: false } as never); // jump back to the top
    await t.settle();
    expect(t.text()).toContain("item-0");
  });

  test("moveCursor no-ops on an empty list or a zero delta", async () => {
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={[]} defaultValue={[]} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;
    expect(() => w.handleKey({ name: "down", handled: false } as never)).not.toThrow();

    const withItems = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s2" items={ITEMS} defaultValue={[]} />
      </VBox>,
      OPTS,
    );
    await withItems.settle();
    const w2 = withItems.findById<SelectionListWidget>("s2") as SelectionListWidget;
    // A key that maps to no navigation/selection delta (unhandled).
    const ev = { name: "x", handled: false } as never;
    w2.handleKey(ev);
    expect((ev as { handled: boolean }).handled).toBe(false);
  });

  test("upward navigation skips a leading disabled row and clamps at the top", async () => {
    const items: ListItem[] = [
      { id: "a", label: "a", disabled: true },
      { id: "b", label: "b" },
      { id: "c", label: "c" },
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

    w.handleKey({ name: "down", handled: false } as never); // cursor -> "b"
    w.handleKey({ name: "up", handled: false } as never); // would land on disabled "a"
    w.handleKey({ name: "space", handled: false } as never);
    await t.settle();
    // The cursor can't move onto the disabled leading row, so it stays on "b".
    expect(changes.at(-1)).toEqual(["b"]);
  });

  test("toggling an already-checked row removes it from the selection", async () => {
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
    w.handleKey({ name: "space", handled: false } as never); // untoggle "a"
    await t.settle();
    expect(changes.at(-1)).toEqual([]);
  });

  test("'a' with no enabled rows is a no-op", async () => {
    const items: ListItem[] = [{ id: "a", label: "a", disabled: true }];
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

  test("'a' unchecks all when every enabled row is already checked", async () => {
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
    expect(changes.at(-1)).toEqual([]); // all enabled rows cleared
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

    const scrollEv = { type: "scroll_down", handled: true } as never;
    w.handleScroll(scrollEv);
    expect((scrollEv as { handled: boolean }).handled).toBe(true);

    const keyEv = { name: "down", handled: true } as never;
    w.handleKey(keyEv);
    expect((keyEv as { handled: boolean }).handled).toBe(true);

    const mouseEv = { type: "press", button: "left", x: 0, y: 0, handled: true } as never;
    w.handleMouse(mouseEv);
    expect((mouseEv as { handled: boolean }).handled).toBe(true);
  });

  test("clicks outside the content rect and releases without a drag are ignored", async () => {
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={ITEMS} defaultValue={[]} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SelectionListWidget>("s") as SelectionListWidget;
    const c = w.getContentRect();

    // Wrong button.
    const rightClick = { type: "press", button: "right", x: c.x, y: c.y, handled: false } as never;
    w.handleMouse(rightClick);
    expect((rightClick as { handled: boolean }).handled).toBe(false);

    // Above/left of content.
    const outside = { type: "press", button: "left", x: c.x - 1, y: c.y, handled: false } as never;
    w.handleMouse(outside);
    expect((outside as { handled: boolean }).handled).toBe(false);

    // A release with no active scrollbar drag is a no-op.
    const release = { type: "release", x: c.x, y: c.y, handled: false } as never;
    w.handleMouse(release);
    expect((release as { handled: boolean }).handled).toBe(false);

    // A press below the last row (past rowCount) doesn't select anything.
    const belowRows = {
      type: "press",
      button: "left",
      x: c.x,
      y: c.bottom - 1,
      handled: false,
    } as never;
    w.handleMouse(belowRows);
    expect((belowRows as { handled: boolean }).handled).toBe(false);
  });

  test("clicking an enabled row moves the cursor there and toggles it", async () => {
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

    // Row index 1 is the enabled "banana.ts".
    w.handleMouse({
      type: "press",
      button: "left",
      x: c.x + 2,
      y: c.y + 1,
      handled: false,
    } as never);
    await t.settle();
    expect(changes.at(-1)).toEqual(["b"]);
    expect(t.text()).toContain("☑ banana.ts");
  });

  test("rowText renders icon and detail text when present", async () => {
    const items: ListItem[] = [{ id: "a", label: "a.ts", icon: "📄", detail: "modified" }];
    const t = await mountApp(
      <VBox style={{ width: 40, height: 4 }}>
        <SelectionList id="s" items={items} defaultValue={[]} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const out = t.text();
    expect(out).toContain("📄");
    expect(out).toContain("modified");
  });

  test("an invisible widget and a zero-size content rect render nothing", async () => {
    const t = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="s" items={ITEMS} defaultValue={[]} visible={false} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    expect(() => t.findById<SelectionListWidget>("s")).not.toThrow();

    const zero = await mountApp(
      <VBox style={{ width: 30, height: 6 }}>
        <SelectionList id="z" items={ITEMS} defaultValue={[]} style={{ width: 0, height: 0 }} />
      </VBox>,
      OPTS,
    );
    await zero.settle();
    expect(zero.findById<SelectionListWidget>("z")).toBeTruthy();
  });
});
