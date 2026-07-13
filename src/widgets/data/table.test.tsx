import { describe, expect, test } from "vitest";
import type { TableColumn } from "../../core.ts";
import { Button, Label, Table } from "../../react.ts";
import { mountApp } from "../../test/harness.tsx";
import { fitCell, type TableWidget } from "./table.ts";

interface Person {
  id: number;
  name: string;
  age: number;
}

const columns: TableColumn<Person>[] = [
  { key: "name", header: "Name", width: 10, sortable: true },
  { key: "age", header: "Age", width: 5, align: "right", sortable: true },
];

const people: Person[] = [
  { id: 1, name: "Charlie", age: 30 },
  { id: 2, name: "Alice", age: 25 },
  { id: 3, name: "Bob", age: 40 },
];

function bigData(n: number): Person[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    name: `Row${i}`,
    age: i % 100,
  }));
}

describe("fitCell", () => {
  test("pads short text to the exact width per alignment", () => {
    expect(fitCell("hi", 5, "left")).toBe("hi   ");
    expect(fitCell("hi", 5, "right")).toBe("   hi");
    expect(fitCell("hi", 5, "center")).toBe(" hi  ");
  });

  test("truncates long text with an ellipsis at the exact width", () => {
    expect(fitCell("Christopher", 5)).toBe("Chri…");
    expect(fitCell("Christopher", 5).length).toBe(5);
  });

  test("returns empty for non-positive width", () => {
    expect(fitCell("x", 0)).toBe("");
  });

  test("collapses to a single ellipsis at width 1", () => {
    expect(fitCell("long", 1)).toBe("…");
  });
});

describe("Table rendering (phase 1)", () => {
  test("renders the header and visible rows as text", async () => {
    const t = await mountApp(<Table data={people} columns={columns} style={{ height: "100%" }} />);
    const txt = t.text();
    expect(txt).toContain("Name");
    expect(txt).toContain("Age");
    expect(txt).toContain("Charlie");
    expect(txt).toContain("Alice");
    expect(txt).toContain("Bob");
  });

  test("derives cell text from row[key] without an explicit accessor", async () => {
    const t = await mountApp(<Table data={people} columns={columns} style={{ height: "100%" }} />);
    expect(t.text()).toContain("30");
    expect(t.text()).toContain("25");
  });

  test("header is bold by default", async () => {
    const t = await mountApp(<Table data={people} columns={columns} style={{ height: "100%" }} />);
    const widget = findTable(t);
    const c = widget.getContentRect();
    expect(t.cellAt(c.x, c.y).style.bold).toBe(true);
  });

  test("headerStyle overrides default formatting", async () => {
    const t = await mountApp(
      <Table
        data={people}
        columns={columns}
        headerStyle={{ bold: false, underline: true, color: "#ff0000" }}
        style={{ height: "100%" }}
      />,
    );
    const widget = findTable(t);
    const c = widget.getContentRect();
    const cell = t.cellAt(c.x, c.y);
    expect(cell.style.bold).toBeFalsy();
    expect(cell.style.underline).toBe(true);
    expect(cell.style.color).toBe("#ff0000");
  });
});

describe("Table virtualization (phase 2)", () => {
  test("renders only the viewport window for a huge dataset", async () => {
    const data = bigData(100_000);
    const t = await mountApp(<Table data={data} columns={columns} style={{ height: 12 }} />, {
      screenStyle: { flexDirection: "column" },
    });
    const txt = t.text();
    expect(txt).toContain("Row0");
    // A row far below the viewport must never be drawn.
    expect(txt).not.toContain("Row5000");
  });

  test("arrow-down past the viewport scrolls new rows into view", async () => {
    const data = bigData(1000);
    const t = await mountApp(<Table data={data} columns={columns} style={{ height: 12 }} />, {
      screenStyle: { flexDirection: "column" },
    });
    const widget = findTable(t);
    t.screen.focusWidget(widget);

    for (let i = 0; i < 20; i++) widget.handleKey({ name: "down", key: "down" } as any);
    await t.settle();

    expect(t.text()).toContain("Row19");
    expect(t.text()).not.toContain("Row0");
  });

  test("mouse wheel scrolls the body", async () => {
    const data = bigData(1000);
    const t = await mountApp(<Table data={data} columns={columns} style={{ height: 12 }} />, {
      screenStyle: { flexDirection: "column" },
    });
    const widget = findTable(t);
    // Each wheel tick moves 3 rows.
    for (let i = 0; i < 10; i++) widget.handleScroll({ type: "scroll_down" } as any);
    await t.settle();
    expect(t.text()).toContain("Row30");
  });
});

describe("Table fixed header + horizontal scroll (phase 3)", () => {
  test("header stays visible after scrolling the body", async () => {
    const data = bigData(1000);
    const t = await mountApp(<Table data={data} columns={columns} style={{ height: 12 }} />, {
      screenStyle: { flexDirection: "column" },
    });
    const widget = findTable(t);
    for (let i = 0; i < 50; i++) widget.handleScroll({ type: "scroll_down" } as any);
    await t.settle();
    // Header label is pinned at the top regardless of body scroll.
    expect(t.text().split("\n")[0]).toContain("Name");
  });
});

describe("Table sorting (phase 4)", () => {
  test("toggleSort cycles asc -> desc -> none and reorders rows (uncontrolled)", async () => {
    const t = await mountApp(<Table data={people} columns={columns} style={{ height: "100%" }} />);
    const widget = findTable(t);

    widget.toggleSort("name");
    await t.settle();
    let names = nameColumnOrder(t.text());
    expect(names[0]).toBe("Alice");
    expect(names[2]).toBe("Charlie");

    widget.toggleSort("name");
    await t.settle();
    names = nameColumnOrder(t.text());
    expect(names[0]).toBe("Charlie");

    widget.toggleSort("name");
    await t.settle();
    expect(widget.sort).toBeNull();
  });

  test("numeric columns sort numerically, not lexically", async () => {
    const data: Person[] = [
      { id: 1, name: "a", age: 9 },
      { id: 2, name: "b", age: 100 },
      { id: 3, name: "c", age: 50 },
    ];
    const t = await mountApp(<Table data={data} columns={columns} style={{ height: "100%" }} />);
    const widget = findTable(t);
    widget.toggleSort("age");
    await t.settle();
    const ages = t
      .text()
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^[a-c]\b/.test(l))
      .map((l) => l);
    // first data row after header should be age 9 (ascending numeric)
    expect(ages[0]).toContain("9");
    expect(ages[ages.length - 1]).toContain("100");
  });

  test("sorts correctly when a column's cell accessor depends on the row's index, not just row 0", async () => {
    // Regression: the default comparator hardcoded dataIndex=0 for every
    // sortValue() call instead of each row's real index, so any column whose
    // `cell` accessor falls back to the (row, rowIndex) argument sorted using
    // row 0's value for every comparison — producing garbage/no-op ordering.
    interface Item {
      score: number;
    }
    const data: Item[] = [{ score: 30 }, { score: 10 }, { score: 20 }];
    // No `key` match on the row itself: sortValue() always falls through to
    // col.cell(row, dataIndex), which returns the row's *index-derived* rank
    // rather than something tied to `row.score` directly — this only produces
    // a correct sort if the real dataIndex is threaded through per row.
    const rankColumns: TableColumn<Item>[] = [
      {
        key: "rank",
        header: "Rank",
        width: 6,
        sortable: true,
        cell: (_row, rowIndex) => String(data[rowIndex].score),
      },
    ];
    const t = await mountApp(
      <Table data={data} columns={rankColumns} style={{ height: "100%" }} />,
    );
    const widget = findTable(t);
    widget.toggleSort("rank");
    await t.settle();
    const lines = t
      .text()
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^\d+$/.test(l));
    expect(lines).toEqual(["10", "20", "30"]);
  });

  test("clicking a sortable header cell triggers a sort", async () => {
    const t = await mountApp(<Table data={people} columns={columns} style={{ height: "100%" }} />);
    const widget = findTable(t);
    const content = widget.getContentRect();
    // Click inside the first ("Name") column header.
    widget.handleMouse({
      type: "press",
      button: "left",
      x: content.x + 1,
      y: content.y,
    } as any);
    await t.settle();
    expect(widget.sort).toEqual({ key: "name", direction: "asc" });
  });

  test("controlled sort defers to onSortChange instead of mutating state", async () => {
    let received: unknown = "untouched";
    const t = await mountApp(
      <Table
        data={people}
        columns={columns}
        sort={null}
        onSortChange={(s) => {
          received = s;
        }}
        style={{ height: "100%" }}
      />,
    );
    const widget = findTable(t);
    widget.toggleSort("age");
    expect(received).toEqual({ key: "age", direction: "asc" });
    // In controlled mode the widget must not mutate its own sort field.
    expect(widget.sort).toBeNull();
  });
});

describe("Table selection (phase 2/4)", () => {
  test("clicking a body row selects it and fires onSelect", async () => {
    let selected: Person | undefined;
    const t = await mountApp(
      <Table
        data={people}
        columns={columns}
        onSelect={(row) => {
          selected = row;
        }}
        style={{ height: "100%" }}
      />,
    );
    const widget = findTable(t);
    const content = widget.getContentRect();
    // First body row is one line below the header.
    widget.handleMouse({
      type: "press",
      button: "left",
      x: content.x + 1,
      y: content.y + 1,
    } as any);
    await t.settle();
    expect(selected).toEqual(people[0]);
    expect(widget.selectedIndex).toBe(0);
  });

  test("arrow navigation fires onSelect; Enter fires onActivate (not onSelect)", async () => {
    const selects: number[] = [];
    let activated = -1;
    const t = await mountApp(
      <Table
        data={people}
        columns={columns}
        onSelect={(_row, idx) => selects.push(idx)}
        onActivate={(_row, idx) => {
          activated = idx;
        }}
        style={{ height: "100%" }}
      />,
    );
    const widget = findTable(t);
    t.screen.focusWidget(widget);
    widget.handleKey({ name: "down", key: "down" } as any); // select 0
    widget.handleKey({ name: "down", key: "down" } as any); // select 1
    expect(selects).toEqual([0, 1]);
    expect(activated).toBe(-1); // navigation never activates

    widget.handleKey({ name: "enter", key: "enter" } as any);
    expect(activated).toBe(1);
  });

  test("double-click activates the row", async () => {
    let activated = -1;
    const t = await mountApp(
      <Table
        data={people}
        columns={columns}
        onActivate={(_row, idx) => {
          activated = idx;
        }}
        style={{ height: "100%" }}
      />,
    );
    const widget = findTable(t);
    const c = widget.getContentRect();
    const press = () =>
      widget.handleMouse({ type: "press", button: "left", x: c.x + 1, y: c.y + 1 } as any);
    press();
    expect(activated).toBe(-1); // single click selects only
    press(); // second click within the double-click window
    expect(activated).toBe(0);
  });
});

describe("Table navigation & layout edge cases", () => {
  test("home/end and pageup/pagedown jump within bounds", async () => {
    const data = bigData(500);
    const t = await mountApp(<Table data={data} columns={columns} style={{ height: 12 }} />, {
      screenStyle: { flexDirection: "column" },
    });
    const widget = findTable(t);
    widget.handleKey({ name: "end" } as any);
    expect(widget.selectedIndex).toBe(499);
    widget.handleKey({ name: "home" } as any);
    expect(widget.selectedIndex).toBe(0);
    widget.handleKey({ name: "pagedown" } as any);
    expect(widget.selectedIndex).toBeGreaterThan(0);
    widget.handleKey({ name: "pageup" } as any);
    expect(widget.selectedIndex).toBe(0);
  });

  test("unhandled keys are left for other widgets", async () => {
    const t = await mountApp(<Table data={people} columns={columns} style={{ height: "100%" }} />);
    const widget = findTable(t);
    const ev = { name: "x" } as any;
    widget.handleKey(ev);
    expect(ev.handled).toBeUndefined();
  });

  test("left/right scroll columns when content exceeds the width", async () => {
    const wide: TableColumn<Person>[] = [
      { key: "name", header: "Name", width: 60 },
      { key: "age", header: "Age", width: 60 },
    ];
    const t = await mountApp(<Table data={people} columns={wide} style={{ height: "100%" }} />, {
      cols: 40,
    });
    const widget = findTable(t);
    widget.handleKey({ name: "right" } as any);
    widget.handleKey({ name: "right" } as any);
    await t.settle();
    // After scrolling right, the first column's leading text is clipped away.
    expect(t.text().split("\n")[0]).not.toMatch(/^Name/);
    widget.handleKey({ name: "left" } as any);
    widget.handleKey({ name: "left" } as any);
    await t.settle();
    expect(t.text().split("\n")[0]).toMatch(/^Name/);
  });

  test("hidden header frees the first body row", async () => {
    const t = await mountApp(
      <Table data={people} columns={columns} showHeader={false} style={{ height: "100%" }} />,
    );
    expect(t.text().split("\n")[0]).toContain("Charlie");
  });

  test("empty data renders only the header without error", async () => {
    const t = await mountApp(<Table data={[]} columns={columns} style={{ height: "100%" }} />);
    expect(t.text()).toContain("Name");
    const widget = findTable(t);
    widget.handleKey({ name: "down" } as any);
    expect(widget.selectedIndex).toBe(-1);
  });

  test("renders a scrollbar thumb when rows overflow the viewport", async () => {
    const data = bigData(1000);
    const t = await mountApp(<Table data={data} columns={columns} style={{ height: 12 }} />, {
      screenStyle: { flexDirection: "column" },
    });
    expect(t.text()).toContain("█");
  });

  test("pressing the scrollbar track jumps the scroll position", async () => {
    const data = bigData(1000);
    const t = await mountApp(<Table data={data} columns={columns} style={{ height: 12 }} />, {
      screenStyle: { flexDirection: "column" },
    });
    const widget = findTable(t);
    const content = widget.getContentRect();
    const scrollbarX = content.right - 1;
    // Press near the bottom of the track -> large scroll offset.
    widget.handleMouse({
      type: "press",
      button: "left",
      x: scrollbarX,
      y: content.bottom - 1,
    } as any);
    await t.settle();
    expect(t.text()).not.toContain("Row0\n");
    // Drag back to the top of the track -> scrolls home.
    widget.handleMouse({ type: "drag", button: "left", x: scrollbarX, y: content.y + 1 } as any);
    await t.settle();
    expect(t.text()).toContain("Row0");
    widget.handleMouse({ type: "release", button: "left", x: scrollbarX, y: content.y } as any);
  });
});

describe("Table rich (widget-bearing) cells (phase 5)", () => {
  test("renders a widget cell's content via column.render", async () => {
    const cols: TableColumn<Person>[] = [
      { key: "name", header: "Name", width: 10 },
      { key: "act", header: "Action", width: 12, render: (r) => <Label>[{r.name}]</Label> },
    ];
    const t = await mountApp(<Table data={people} columns={cols} style={{ height: "100%" }} />);
    await t.settle();
    await t.settle(); // one extra frame: viewport callback -> React -> cell widgets
    const txt = t.text();
    expect(txt).toContain("Charlie"); // text column
    expect(txt).toContain("[Charlie]"); // rich column content
  });

  test("only materializes cell widgets for the visible window", async () => {
    const data = bigData(1000);
    const cols: TableColumn<Person>[] = [
      { key: "name", header: "Name", width: 10 },
      { key: "act", header: "Act", width: 14, render: (r) => <Label>act-{r.name}</Label> },
    ];
    const t = await mountApp(<Table data={data} columns={cols} style={{ height: 12 }} />, {
      screenStyle: { flexDirection: "column" },
    });
    await t.settle();
    await t.settle();
    // Count mounted cell widgets — should be ~viewport rows, not 1000.
    let cellCount = 0;
    t.screen.walk((n: any) => {
      if (n.constructor?.name === "TableCellWidget") cellCount++;
    });
    expect(cellCount).toBeGreaterThan(0);
    expect(cellCount).toBeLessThan(40);
    expect(t.text()).toContain("act-Row0");
    expect(t.text()).not.toContain("act-Row500");
  });

  test("column.render is invoked only for the visible window, not every row", async () => {
    const data = bigData(1000);
    let renderCalls = 0;
    const cols: TableColumn<Person>[] = [
      { key: "name", header: "Name", width: 10 },
      {
        key: "act",
        header: "Act",
        width: 14,
        render: (r) => {
          renderCalls++;
          return <Label>act-{r.name}</Label>;
        },
      },
    ];
    const t = await mountApp(<Table data={data} columns={cols} style={{ height: 12 }} />, {
      screenStyle: { flexDirection: "column" },
    });
    await t.settle();
    await t.settle();
    // render() must be called O(viewport), never O(rows). A regression that
    // materializes the full dataset would push this into the thousands.
    expect(renderCalls).toBeGreaterThan(0);
    expect(renderCalls).toBeLessThan(40);
  });

  test("a button inside a cell is clickable through the table", async () => {
    let clicked = "";
    const cols: TableColumn<Person>[] = [
      { key: "name", header: "Name", width: 10 },
      {
        key: "act",
        header: "Act",
        width: 14,
        render: (r) => <Button onClick={() => (clicked = r.name)}>Go</Button>,
      },
    ];
    const t = await mountApp(<Table data={people} columns={cols} style={{ height: "100%" }} />);
    await t.settle();
    await t.settle();
    // Locate the first row's button widget and click at its position.
    let btn: any;
    t.screen.walk((n: any) => {
      if (!btn && n.tagName === "button") btn = n;
    });
    expect(btn).toBeDefined();
    const r = btn.region;
    // Dispatch through the real App mouse pipeline (hit-test -> onClick).
    t.driver.emit("mouse", { type: "press", button: "left", x: r.x, y: r.y });
    await t.settle();
    expect(clicked).toBe("Charlie");
  });
});

describe("Table body text selection", () => {
  test("dragging across a body row copies the rendered cell text", async () => {
    const t = await mountApp(<Table data={people} columns={columns} style={{ height: "100%" }} />);
    const widget = findTable(t);
    await t.settle();
    const c = widget.getContentRect();
    const rowY = c.y + 1; // first body row, below the header
    // Drag across the Name column of the first row ("Charlie" padded to 10).
    // Exclusive end: cols [0,7) covers the 7 letters of "Charlie".
    widget.handleMouse({ type: "press", button: "left", x: c.x, y: rowY });
    widget.handleMouse({ type: "drag", button: "left", x: c.x + 7, y: rowY });
    widget.handleMouse({ type: "release", button: "left", x: c.x + 7, y: rowY });
    expect(await t.driver.clipboard.get()).toBe("Charlie");
  });

  test("a plain row click still selects the row and copies nothing", async () => {
    let selected = -1;
    const t = await mountApp(
      <Table
        data={people}
        columns={columns}
        onSelect={(_row, idx) => {
          selected = idx;
        }}
        style={{ height: "100%" }}
      />,
    );
    const widget = findTable(t);
    await t.settle();
    t.driver.clipboard.set("untouched");
    const c = widget.getContentRect();
    widget.handleMouse({ type: "press", button: "left", x: c.x + 1, y: c.y + 1 });
    widget.handleMouse({ type: "release", button: "left", x: c.x + 1, y: c.y + 1 });
    expect(selected).toBe(0);
    expect(widget.selectedIndex).toBe(0);
    expect(await t.driver.clipboard.get()).toBe("untouched");
  });
});

describe("Table accessibility", () => {
  test("getAccessibleNode reports row/column counts and the selected row's first-column text", async () => {
    const t = await mountApp(<Table data={people} columns={columns} style={{ height: 8 }} />);
    const widget = findTable<Person>(t);

    let node = widget.getAccessibleNode();
    expect(node?.role).toBe("table");
    expect(node?.state).toContain("3 rows");
    expect(node?.state).toContain("2 columns");
    expect(node?.value).toBeUndefined(); // nothing selected yet

    widget.selectedIndex = 1;
    node = widget.getAccessibleNode();
    expect(node?.value).toBe("2"); // 1-based
    expect(node?.label).toBe(people[1].name);
  });
});

// --- helpers ---------------------------------------------------------------

function findTable<Row>(t: Awaited<ReturnType<typeof mountApp>>): TableWidget<Row> {
  let found: TableWidget<Row> | undefined;
  t.screen.walk((node) => {
    if ((node as any).constructor?.name === "TableWidget") found = node as TableWidget<Row>;
  });
  if (!found) throw new Error("TableWidget not found in tree");
  return found;
}

/** Extract the Name column (first 10 cells) of each body line, in order. */
function nameColumnOrder(text: string): string[] {
  return text
    .split("\n")
    .slice(1) // drop header
    .map((l) => l.slice(0, 10).trim())
    .filter((s) => s.length > 0);
}
