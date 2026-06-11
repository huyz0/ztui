import { describe, expect, test } from "vitest";
import { SelectionList, VBox } from "../react/components.tsx";
import type { ListItem } from "../widgets/data/list-view.ts";
import type { SelectionListWidget } from "../widgets/data/selection-list.ts";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 40,
  rows: 8,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" },
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
});
