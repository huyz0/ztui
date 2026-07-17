import { describe, expect, test } from "vitest";
import type { TableColumn } from "../../core.ts";
import { Button, Label, Table } from "../../react.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
import { findWidgetByType, mountApp } from "../../test/harness.tsx";
import { TableWidget } from "./table.ts";

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

  test("grouped mode passes each item's within-group index to cell(), not its visual row index", async () => {
    // Regression: rowAtView() passed the visual row index `v` (which also
    // counts interleaved group-header rows) to cell()/selectableLines()
    // instead of the item's own position within its group.
    interface Item {
      name: string;
    }
    const groupA = { id: "a", title: "Group A", items: [{ name: "a1" }, { name: "a2" }] };
    const groupB = { id: "b", title: "Group B", items: [{ name: "b1" }, { name: "b2" }] };
    const numberedColumns: TableColumn<Item>[] = [
      {
        key: "name",
        header: "Name",
        width: 10,
        cell: (row, rowIndex) => `${rowIndex + 1}. ${row.name}`,
      },
    ];
    const t = await mountApp(
      <Table
        groups={[groupA, groupB]}
        columns={numberedColumns}
        style={{ height: "100%", width: 20 }}
      />,
    );
    await t.settle();
    const lines = t
      .text()
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^\d+\. /.test(l));
    // Each group's items are numbered 1, 2 from their own start, not the
    // visual row position (which would give 2, 3 for group A and 5, 6 for
    // group B once the two header rows are counted in).
    expect(lines).toEqual(["1. a1", "2. a2", "1. b1", "2. b2"]);
  });

  test("grouped mode's selectableLines() (select-all/copy) uses each item's own index too, not row 0", async () => {
    // Regression: rowAtView() got fixed to pass the item's real itemIndex,
    // but selectableLines() (used for select-all/copy) still hardcoded 0 as
    // the rowIndex for every grouped row. render() draws correctly, but
    // copying the table body produced "1. a1", "1. a2", "1. b1", "1. b2"
    // instead of matching what's actually on screen.
    interface Item {
      name: string;
    }
    const groupA = { id: "a", title: "Group A", items: [{ name: "a1" }, { name: "a2" }] };
    const groupB = { id: "b", title: "Group B", items: [{ name: "b1" }, { name: "b2" }] };
    const numberedColumns: TableColumn<Item>[] = [
      {
        key: "name",
        header: "Name",
        width: 10,
        cell: (row, rowIndex) => `${rowIndex + 1}. ${row.name}`,
      },
    ];
    const t = await mountApp(
      <Table
        groups={[groupA, groupB]}
        columns={numberedColumns}
        style={{ height: "100%", width: 20 }}
      />,
    );
    await t.settle();
    const widget = findTable(t);
    const lines = widget
      .selectableLines()
      .map((l) => l.trim())
      .filter((l) => /^\d+\. /.test(l));
    expect(lines).toEqual(["1. a1", "2. a2", "1. b1", "2. b2"]);
  });

  test("auto-width column sampling uses each row's real index, not row 0, so index-dependent text isn't truncated", async () => {
    // Regression: resolveColumnWidths() sampled every visible row's cell text
    // with rowIndex hardcoded to 0, so an index-dependent column (e.g. row
    // numbering) had its auto-width sized as if every sampled row were row 0.
    // Row 10's "#10 x" (5 wide) got measured as "#1 x" (4 wide), truncating
    // it once actually rendered.
    interface Item {
      name: string;
    }
    const items: Item[] = Array.from({ length: 10 }, () => ({ name: "x" }));
    const numberedColumns: TableColumn<Item>[] = [
      { key: "name", header: "Name", cell: (row, rowIndex) => `#${rowIndex + 1} ${row.name}` },
    ];
    const t = await mountApp(
      <Table data={items} columns={numberedColumns} style={{ height: "100%", width: 20 }} />,
    );
    await t.settle();
    expect(t.text()).toContain("#10 x");
    expect(t.text()).not.toContain("…");
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

  test("selection tracks the selected row's identity across a sort, not its old view slot", async () => {
    // Bug: `selectedIndex` is a raw view-order position with nothing that
    // re-anchors it to the same logical row when `toggleSort` reorders
    // `viewIndex`. Select Alice (view row 1, alphabetically first among the
    // three), sort by name, and the widget silently reports whichever row
    // now lands in view slot 1 — not Alice — even though the user never
    // reselected anything.
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
    // Unsorted order is people[] insertion order: Charlie, Alice, Bob.
    // Click view row 1 (second body row) to select Alice.
    widget.handleMouse({
      type: "press",
      button: "left",
      x: content.x + 1,
      y: content.y + 2,
    } as any);
    await t.settle();
    expect(selected).toEqual(people[1]); // Alice
    expect(widget.selectedIndex).toBe(1);

    widget.toggleSort("name"); // asc: Alice, Bob, Charlie
    await t.settle();

    const stillSelected = (widget as any).rowAtView(widget.selectedIndex)?.row as
      | Person
      | undefined;
    expect(stillSelected).toEqual(people[1]); // Alice
  });

  test("re-anchors by data index (not row identity) across a sort, so duplicate row values aren't confused", async () => {
    // Regression guard: an earlier version of the sort-selection fix re-found
    // the selected row via `data.indexOf(selectedRow)`, which is ambiguous
    // when the same value/reference appears more than once in `data` — it
    // always resolves to the *first* occurrence, silently moving selection
    // to the wrong (earlier) duplicate instead of tracking the actual row
    // the user selected. Using the row's own stable data index (valid
    // whenever `data` itself hasn't changed, only the sort has) avoids that
    // ambiguity: it re-anchors to the same *slot*, not the same-looking value.
    const dupData = ["Bob", "Alice", "Bob"]; // "Bob" appears at data index 0 and 2
    const dupColumns: TableColumn<string>[] = [
      {
        key: "name",
        header: "Name",
        width: 10,
        sortable: true,
        compare: (a, b) => a.localeCompare(b),
      },
    ];
    const t = await mountApp(
      <Table data={dupData} columns={dupColumns} style={{ height: "100%" }} />,
    );
    const widget = findTable<string>(t);

    // Select the *third* row (data index 2, the second "Bob") — not the first.
    widget.selectedIndex = 2;
    widget.toggleSort("name"); // stable sort: "Alice", then both "Bob"s in original order
    await t.settle();

    // Correct: still anchored to data index 2's new slot (view index 2).
    // The bug would instead resolve to data index 0's new slot (view index 1),
    // since `indexOf("Bob")` always finds the first "Bob" regardless of which
    // occurrence was actually selected.
    expect(widget.selectedIndex).toBe(2);
  });

  test("re-anchors selection by nearest identity when data is replaced with a new array", async () => {
    // When `data` is reassigned to a genuinely new array (not just re-sorted
    // in place), the fast "same array, hint is still valid" path misses, so
    // re-anchoring falls back to a scan for the same row nearest its old
    // index — this covers that scan path, including disambiguating a
    // duplicate value by proximity rather than always picking the first hit
    // (what a plain `indexOf` would do).
    const dupData = ["X", "Bob", "Bob"];
    const dupColumns: TableColumn<string>[] = [{ key: "name", header: "Name", width: 10 }];
    const t = await mountApp(
      <Table data={dupData} columns={dupColumns} style={{ height: "100%" }} />,
    );
    const widget = findTable<string>(t);

    widget.selectedIndex = 2; // the second "Bob"
    widget.data = ["Bob", "Bob", "Y", "Z"]; // both "Bob"s now earlier; old index (2) is "Y"
    // "missing" doesn't match any column key, so this only triggers a rebuild
    // without actually reordering — keeps the data-index math easy to reason
    // about (viewIndex stays an identity mapping).
    widget.toggleSort("missing");
    await t.settle();

    // Nearest to the old hint (2) is data index 1 (dist 1), not index 0 (dist
    // 2) — the first occurrence a plain `indexOf` would have returned.
    expect(widget.selectedIndex).toBe(1);
  });

  test("clears selection when the previously-selected row is no longer in a replaced data array", async () => {
    const t = await mountApp(<Table data={people} columns={columns} style={{ height: "100%" }} />);
    const widget = findTable<Person>(t);

    widget.selectedIndex = 1; // Alice
    widget.data = [people[0], people[2]]; // Alice removed entirely
    widget.toggleSort("name");
    await t.settle();

    expect(widget.selectedIndex).toBe(-1);
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

  test("switching to grouped mode hides any leftover rich cell widgets", async () => {
    // Grouped tables are text-only (the React layer skips `render` cells when
    // `groups` is set), but layoutChildren() still guards against rich cell
    // widgets left over from a prior flat render — e.g. a caller flips
    // `groups` on without first letting React unmount them.
    const cols: TableColumn<Person>[] = [
      { key: "name", header: "Name", width: 10 },
      { key: "act", header: "Act", width: 14, render: (r) => <Label>act-{r.name}</Label> },
    ];
    const t = await mountApp(<Table data={people} columns={cols} style={{ height: "100%" }} />);
    await t.settle();
    await t.settle();
    const w = findWidgetByType<TableWidget<Person>>(t, "TableWidget");
    expect(w.layoutChildren()).toBe(true); // flat mode positions the rich cells

    w.groups = [{ id: "g1", title: "Group", items: people }];
    expect(w.layoutChildren()).toBe(true);
    let anyVisible = false;
    t.screen.walk((n: any) => {
      if (n.constructor?.name === "TableCellWidget" && n.visible) anyVisible = true;
    });
    expect(anyVisible).toBe(false);
  });

  test("a cell scrolled outside the visible window is hidden", async () => {
    const data = bigData(100);
    const cols: TableColumn<Person>[] = [
      { key: "name", header: "Name", width: 10 },
      { key: "act", header: "Act", width: 14, render: (r) => <Label>act-{r.name}</Label> },
    ];
    const t = await mountApp(<Table data={data} columns={cols} style={{ height: 12 }} />, {
      screenStyle: { flexDirection: "column" },
    });
    await t.settle();
    await t.settle();
    const w = findWidgetByType<TableWidget<Person>>(t, "TableWidget");
    let farCell: any;
    t.screen.walk((n: any) => {
      if (n.constructor?.name === "TableCellWidget" && n.viewRow === 0) farCell = n;
    });
    expect(farCell).toBeDefined();
    // Scroll the table so row 0's now-stale cell widget falls outside the
    // current window before the next layout pass reconciles it away.
    (w as any).scrollTop = 50;
    w.layoutChildren();
    expect(farCell.visible).toBe(false);
  });

  test("calling onViewportChange again with an unchanged window is a no-op", async () => {
    // The widget itself dedupes by signature before invoking the callback, but
    // the React wrapper's own setState comparator is exercised directly here
    // to cover its "unchanged viewport" branch.
    const cols: TableColumn<Person>[] = [
      { key: "name", header: "Name", width: 10 },
      { key: "act", header: "Act", width: 14, render: (r) => <Label>act-{r.name}</Label> },
    ];
    const t = await mountApp(<Table data={people} columns={cols} style={{ height: "100%" }} />);
    await t.settle();
    await t.settle();
    const w = findWidgetByType<TableWidget<Person>>(t, "TableWidget");
    const before = t.text();
    // Same first/dataIndices as the current viewport, but a fresh array
    // reference — must be recognized as unchanged and skip re-rendering.
    const dataIndices = people.map((_, i) => i);
    expect(() => (w as any).onViewportChange({ first: 0, dataIndices })).not.toThrow();
    await t.settle();
    expect(t.text()).toBe(before);
  });

  test("a rich table with no `data` prop renders without throwing", async () => {
    const cols: TableColumn<Person>[] = [
      { key: "name", header: "Name", width: 10 },
      { key: "act", header: "Act", width: 14, render: (r) => <Label>act-{r.name}</Label> },
    ];
    const t = await mountApp(<Table columns={cols} style={{ height: "100%" }} />);
    await expect(t.settle()).resolves.not.toThrow();
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

describe("Table — additional branch coverage", () => {
  test("getAccessibleNode reports nothing selected when selectedIndex points past the data", async () => {
    const t = await mountApp(<Table data={people} columns={columns} style={{ height: 8 }} />);
    const widget = findTable(t);
    widget.selectedIndex = 999; // stale/out-of-range index
    const node = widget.getAccessibleNode();
    expect(node?.value).toBe("1000"); // value is 1-based on the raw index...
    expect(node?.label).toBe(""); // ...but rowAtView() finds nothing, so no label
  });

  test("getAccessibleNode returns null when the table isn't visible", async () => {
    const t = await mountApp(<Table data={people} columns={columns} style={{ height: 8 }} />);
    const widget = findTable(t);
    widget.visible = false;
    expect(widget.getAccessibleNode()).toBeNull();
  });

  test("getAccessibleNode reports focused state and singular row/column counts", async () => {
    const t = await mountApp(
      <Table data={[people[0]]} columns={[columns[0]]} style={{ height: 8 }} />,
    );
    const widget = findTable(t);
    t.screen.focusWidget(widget);
    const node = widget.getAccessibleNode();
    expect(node?.state).toContain("focused");
    expect(node?.state).toContain("1 row");
    expect(node?.state).toContain("1 column");
  });

  test("getAccessibleNode reports the disabled state", async () => {
    const t = await mountApp(
      <Table data={people} columns={columns} disabled style={{ height: 8 }} />,
    );
    const widget = findTable(t);
    expect(widget.getAccessibleNode()?.state).toContain("disabled");
  });

  test("getAccessibleNode has no label when there are no columns at all", async () => {
    const t = await mountApp(<Table data={people} columns={[]} style={{ height: 8 }} />);
    const widget = findTable(t);
    widget.selectedIndex = 0;
    expect(widget.getAccessibleNode()?.label).toBe("");
  });

  test("toggleGroup expands a previously collapsed group back open", async () => {
    const group = { id: "g", title: "G", items: people, collapsed: true };
    const t = await mountApp(
      <Table groups={[group]} columns={columns} style={{ height: "100%" }} />,
    );
    const widget = findTable(t);
    await t.settle();
    widget.toggleGroup("g"); // was seeded collapsed -> expands
    await t.settle();
    expect(t.text()).toContain("Charlie");
    widget.toggleGroup("g"); // collapses again
    await t.settle();
    expect(t.text()).not.toContain("Charlie");
  });

  test("keyboard navigation before layout falls back to a viewport height of 1", async () => {
    const t = await mountApp(<Table data={people} columns={columns} style={{ height: "100%" }} />);
    const widget = findTable(t);
    // Force lastVisibleRows back to its pre-layout default to exercise the
    // `this.lastVisibleRows || 1` fallback inside ensureVisible().
    (widget as any).lastVisibleRows = 0;
    widget.handleKey({ name: "down" } as any);
    expect(widget.selectedIndex).toBe(0);
  });

  test("handleScroll ignores an event the base handler already marked handled", async () => {
    const t = await mountApp(<Table data={bigData(100)} columns={columns} style={{ height: 8 }} />);
    const widget = findTable(t);
    const before = (widget as any).scrollTop;
    widget.handleScroll({ type: "scroll_down", handled: true } as any);
    expect((widget as any).scrollTop).toBe(before);
  });

  test("handleKey ignores an event the base handler already marked handled", async () => {
    const t = await mountApp(<Table data={people} columns={columns} style={{ height: "100%" }} />);
    const widget = findTable(t);
    widget.handleKey({ name: "down", handled: true } as any);
    expect(widget.selectedIndex).toBe(-1);
  });

  test("handleKey reads the key name from ev.key when ev.name is absent", async () => {
    const t = await mountApp(<Table data={people} columns={columns} style={{ height: "100%" }} />);
    const widget = findTable(t);
    widget.handleKey({ key: "down" } as any);
    expect(widget.selectedIndex).toBe(0);
  });

  test("handleMouse ignores an event the base handler already marked handled", async () => {
    const t = await mountApp(<Table data={people} columns={columns} style={{ height: "100%" }} />);
    const widget = findTable(t);
    widget.handleMouse({ type: "press", button: "left", x: 0, y: 0, handled: true } as any);
    expect(widget.selectedIndex).toBe(-1);
  });

  test("handleMouse ignores non-press/non-left events and clicks outside the content rect", async () => {
    const t = await mountApp(<Table data={people} columns={columns} style={{ height: "100%" }} />);
    const widget = findTable(t);
    const content = widget.getContentRect();
    widget.handleMouse({ type: "move", button: "left", x: content.x, y: content.y } as any);
    expect(widget.selectedIndex).toBe(-1);
    widget.handleMouse({ type: "press", button: "left", x: content.x - 5, y: content.y } as any);
    expect(widget.selectedIndex).toBe(-1);
  });

  test("clicking above the first body row (negative row offset) does nothing", async () => {
    const t = await mountApp(<Table data={people} columns={columns} style={{ height: "100%" }} />);
    const widget = findTable(t);
    const content = widget.getContentRect();
    widget.handleMouse({
      type: "press",
      button: "left",
      x: content.x,
      y: content.y - 1,
    } as any);
    expect(widget.selectedIndex).toBe(-1);
  });

  test("clicking past the last row does nothing", async () => {
    const t = await mountApp(<Table data={people} columns={columns} style={{ height: 20 }} />, {
      screenStyle: { flexDirection: "column" },
    });
    const widget = findTable(t);
    const content = widget.getContentRect();
    widget.handleMouse({
      type: "press",
      button: "left",
      x: content.x,
      y: content.bottom - 1,
    } as any);
    expect(widget.selectedIndex).toBe(-1);
  });

  test("selectableLines is empty before the table has ever been laid out", () => {
    const t = new TableWidget<Person>();
    t.data = people;
    t.columns = columns;
    expect(t.selectableLines()).toEqual([]);
  });

  test("columnAtX treats a column with no measured width yet as zero-wide", async () => {
    const t = await mountApp(<Table data={people} columns={columns} style={{ height: "100%" }} />);
    const widget = findTable(t);
    await t.settle();
    (widget as any).lastColWidths = []; // simulate stale/short width cache
    const content = widget.getContentRect();
    // Clicking a header cell should not throw and should not sort (no column found).
    expect(() =>
      widget.handleMouse({ type: "press", button: "left", x: content.x + 1, y: content.y } as any),
    ).not.toThrow();
  });

  test("a zero-size table's render/computeMetrics bail out cleanly", async () => {
    const t = await mountApp(
      <Table data={people} columns={columns} style={{ width: 0, height: 0 }} />,
    );
    const widget = findTable(t);
    expect(() => t.app.queueRender()).not.toThrow();
    await expect(t.settle()).resolves.not.toThrow();
    expect(widget.selectedIndex).toBe(-1);
  });

  test("an invisible table's render() is a no-op", async () => {
    const t = await mountApp(<Table data={people} columns={columns} style={{ height: "100%" }} />);
    const widget = findTable(t);
    widget.visible = false;
    const buffer = new ScreenBuffer(20, 5);
    expect(() => widget.render(buffer)).not.toThrow();
  });

  test("a fr-width column with an unparsable fraction defaults to 1fr", async () => {
    const cols: TableColumn<Person>[] = [
      { key: "name", header: "Name", width: "xfr" },
      { key: "age", header: "Age", width: "1fr" },
    ];
    const t = await mountApp(<Table data={people} columns={cols} style={{ height: "100%" }} />);
    await expect(t.settle()).resolves.not.toThrow();
    expect(t.text()).toContain("Charlie");
  });

  test("a table with zero columns renders without a gap-related crash", async () => {
    const t = await mountApp(<Table data={people} columns={[]} style={{ height: "100%" }} />);
    await expect(t.settle()).resolves.not.toThrow();
  });

  test("minWidth/maxWidth clamp an auto-sized column", async () => {
    const cols: TableColumn<Person>[] = [
      { key: "name", header: "Name", minWidth: 20 },
      { key: "age", header: "Age", maxWidth: 2 },
    ];
    const t = await mountApp(<Table data={people} columns={cols} style={{ height: "100%" }} />);
    await t.settle();
    const widget = findTable(t);
    const widths = (widget as any).lastColWidths as number[];
    expect(widths[0]).toBeGreaterThanOrEqual(20);
    expect(widths[1]).toBeLessThanOrEqual(2);
  });

  test("an invisible table-cell widget's render() is a no-op", async () => {
    const cols: TableColumn<Person>[] = [
      { key: "name", header: "Name", width: 10 },
      { key: "act", header: "Act", width: 12, render: (r) => <Label>[{r.name}]</Label> },
    ];
    const t = await mountApp(<Table data={people} columns={cols} style={{ height: "100%" }} />);
    await t.settle();
    await t.settle();
    let cell: any;
    t.screen.walk((n: any) => {
      if (!cell && n.constructor?.name === "TableCellWidget") cell = n;
    });
    expect(cell).toBeDefined();
    cell.visible = false;
    const buffer = new ScreenBuffer(20, 5);
    expect(() => cell.render(buffer)).not.toThrow();
  });
});

// --- helpers ---------------------------------------------------------------

function findTable<Row>(t: Awaited<ReturnType<typeof mountApp>>): TableWidget<Row> {
  return findWidgetByType<TableWidget<Row>>(t, "TableWidget");
}

/** Extract the Name column (first 10 cells) of each body line, in order. */
function nameColumnOrder(text: string): string[] {
  return text
    .split("\n")
    .slice(1) // drop header
    .map((l) => l.slice(0, 10).trim())
    .filter((s) => s.length > 0);
}
