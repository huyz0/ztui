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
});
