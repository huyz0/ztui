import { describe, expect, test, vi } from "vitest";
import type { ListItem, RowGroup, TableColumn } from "../../core.ts";
import { ListView, Table } from "../../react.ts";
import { findWidgetByType, mountApp } from "../../test/harness.tsx";
import type { ListViewWidget } from "./list-view.ts";
import type { TableWidget } from "./table.ts";

const listGroups: RowGroup<ListItem>[] = [
  {
    id: "fruit",
    title: "Fruit",
    items: [
      { id: "apple", label: "Apple" },
      { id: "pear", label: "Pear" },
    ],
  },
  { id: "veg", title: "Veg", collapsed: true, items: [{ id: "kale", label: "Kale" }] },
  { id: "grain", title: "Grain", items: [{ id: "rice", label: "Rice" }] },
];

function findList(t: Awaited<ReturnType<typeof mountApp>>): ListViewWidget {
  return findWidgetByType<ListViewWidget>(t, "ListViewWidget");
}

function findTable(t: Awaited<ReturnType<typeof mountApp>>): TableWidget {
  return findWidgetByType<TableWidget>(t, "TableWidget");
}

describe("ListView grouping", () => {
  test("renders group titles with counts; collapsed group hides its items", async () => {
    const t = await mountApp(<ListView groups={listGroups} style={{ height: "100%" }} />);
    const txt = t.text();
    expect(txt).toContain("Fruit");
    expect(txt).toContain("(2)");
    expect(txt).toContain("Apple");
    expect(txt).toContain("Pear");
    // Veg starts collapsed: title shows, item hidden.
    expect(txt).toContain("Veg");
    expect(txt).not.toContain("Kale");
  });

  test("arrow navigation skips header rows", async () => {
    const onSelect = vi.fn();
    const t = await mountApp(
      <ListView groups={listGroups} onSelect={onSelect} style={{ height: "100%" }} />,
    );
    const list = findList(t);
    list.handleKey({ name: "down" } as any); // header Fruit -> Apple
    expect(onSelect).toHaveBeenLastCalledWith({ id: "apple", label: "Apple" });
    list.handleKey({ name: "down" } as any); // -> Pear
    list.handleKey({ name: "down" } as any); // skips Veg header (collapsed) + Grain header -> Rice
    expect(onSelect).toHaveBeenLastCalledWith({ id: "rice", label: "Rice" });
  });

  test("clicking a title toggles collapse", async () => {
    const onToggle = vi.fn();
    const t = await mountApp(
      <ListView groups={listGroups} onToggleGroup={onToggle} style={{ height: "100%" }} />,
    );
    const list = findList(t);
    const c = (list as any).getContentRect();
    // Row 0 is the "Fruit" header.
    list.handleMouse({ type: "press", button: "left", x: c.x, y: c.y, handled: false } as any);
    await t.settle();
    expect(onToggle).toHaveBeenCalledWith("fruit", true);
    expect(t.text()).not.toContain("Apple");
  });

  test("left collapses and right expands the cursor's group", async () => {
    const t = await mountApp(<ListView groups={listGroups} style={{ height: "100%" }} />);
    const list = findList(t);
    list.handleKey({ name: "down" } as any); // -> Apple (in Fruit)
    list.handleKey({ name: "left" } as any); // collapse Fruit
    await t.settle();
    expect(t.text()).not.toContain("Apple");
    list.handleKey({ name: "right" } as any); // expand Fruit
    await t.settle();
    expect(t.text()).toContain("Apple");
  });
});

interface Row {
  id: string;
  name: string;
}

const tableGroups: RowGroup<Row>[] = [
  {
    id: "a",
    title: "Group A",
    items: [
      { id: "a1", name: "Alpha" },
      { id: "a2", name: "Beta" },
    ],
  },
  { id: "b", title: "Group B", collapsed: true, items: [{ id: "b1", name: "Gamma" }] },
];

const cols: TableColumn<Row>[] = [{ key: "name", header: "Name", width: "1fr" }];

describe("Table grouping", () => {
  test("renders group titles; collapsed group hides its rows", async () => {
    const t = await mountApp(
      <Table groups={tableGroups} columns={cols} showHeader={false} style={{ height: "100%" }} />,
    );
    const txt = t.text();
    expect(txt).toContain("Group A");
    expect(txt).toContain("Alpha");
    expect(txt).toContain("Beta");
    expect(txt).toContain("Group B");
    expect(txt).not.toContain("Gamma");
  });

  test("arrow navigation skips header rows and reports the row", async () => {
    const onSelect = vi.fn();
    const t = await mountApp(
      <Table
        groups={tableGroups}
        columns={cols}
        showHeader={false}
        onSelect={onSelect}
        style={{ height: "100%" }}
      />,
    );
    const tbl = findTable(t);
    tbl.handleKey({ name: "down" } as any); // header A -> Alpha
    expect(onSelect.mock.calls.at(-1)?.[0]).toMatchObject({ id: "a1" });
    tbl.handleKey({ name: "down" } as any); // -> Beta (skips Group B header next time)
    expect(onSelect.mock.calls.at(-1)?.[0]).toMatchObject({ id: "a2" });
  });

  test("clicking a title toggles collapse", async () => {
    const onToggle = vi.fn();
    const t = await mountApp(
      <Table
        groups={tableGroups}
        columns={cols}
        showHeader={false}
        onToggleGroup={onToggle}
        style={{ height: "100%" }}
      />,
    );
    const tbl = findTable(t);
    const c = (tbl as any).getContentRect();
    // Body starts at content.y (no column header); row 0 is the "Group A" title.
    tbl.handleMouse({ type: "press", button: "left", x: c.x, y: c.y, handled: false } as any);
    await t.settle();
    expect(onToggle).toHaveBeenCalledWith("a", true);
    expect(t.text()).not.toContain("Alpha");
  });
});
