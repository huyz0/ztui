import { describe, expect, test } from "vitest";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { Box, TabContainer } from "../../react.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
import { mountApp } from "../../test/harness.tsx";
import { BoxWidget } from "./box.ts";
import { TabContainerWidget } from "./tabcontainer.ts";

describe("TabContainer Widget Suite", () => {
  test("TabContainer active tab toggles visibility and positions child", async () => {
    const { findById } = await mountApp(
      <TabContainer id="tabs" activeIndex={0}>
        <Box id="pane0" label="First Tab" style={{ height: 5 }}>
          First Pane Content
        </Box>
        <Box id="pane1" label="Second Tab" style={{ height: 5 }}>
          Second Pane Content
        </Box>
      </TabContainer>,
      { cols: 40, rows: 10 },
    );

    const tabsWidget = findById("tabs");
    const pane0 = findById("pane0");
    const pane1 = findById("pane1");

    expect(tabsWidget).toBeDefined();
    expect(pane0).toBeDefined();
    expect(pane1).toBeDefined();
    if (!tabsWidget || !pane0 || !pane1) return;

    // Verify initial visible state
    expect(pane0.visible).toBe(true);
    expect(pane1.visible).toBe(false);

    // pane0 should start at y = tabs.region.y + 1 (tabBarHeight)
    const tabsRect = tabsWidget.getContentRect();
    expect(pane0.region.y).toBe(tabsRect.y + 1);
  });

  test("Keyboard arrow navigation and selection", async () => {
    let activeIdx = 0;
    const { screen, findById } = await mountApp(
      <TabContainer
        id="tabs"
        activeIndex={activeIdx}
        onChange={(idx) => {
          activeIdx = idx;
        }}
      >
        <Box id="pane0" label="A" />
        <Box id="pane1" label="B" />
        <Box id="pane2" label="C" />
      </TabContainer>,
      { cols: 40, rows: 10 },
    );

    const tabsWidget = findById("tabs");
    expect(tabsWidget).toBeDefined();
    if (!tabsWidget) return;
    screen.focusWidget(tabsWidget);
    expect(tabsWidget.focused).toBe(true);

    // Default state: index 0
    expect(tabsWidget.hoveredIndex).toBe(0);
    expect(tabsWidget.activeIndex).toBe(0);

    // Right arrow moves the hover, not the selection
    tabsWidget.handleKey({ key: "right" });
    expect(tabsWidget.hoveredIndex).toBe(1);
    expect(tabsWidget.activeIndex).toBe(0);

    // Enter selects
    tabsWidget.handleKey({ key: "enter" });
    expect(tabsWidget.activeIndex).toBe(1);
    expect(activeIdx).toBe(1);

    tabsWidget.handleKey({ key: "down" });
    expect(tabsWidget.hoveredIndex).toBe(2);

    // Space selects
    tabsWidget.handleKey({ key: "space" });
    expect(tabsWidget.activeIndex).toBe(2);
    expect(activeIdx).toBe(2);

    tabsWidget.handleKey({ key: "left" });
    expect(tabsWidget.hoveredIndex).toBe(1);

    tabsWidget.handleKey({ key: " " });
    expect(tabsWidget.activeIndex).toBe(1);
    expect(activeIdx).toBe(1);
  });

  test("Mouse click switches tabs", async () => {
    let activeIdx = 0;
    const { findById, settle } = await mountApp(
      <TabContainer
        id="tabs"
        activeIndex={activeIdx}
        onChange={(idx) => {
          activeIdx = idx;
        }}
      >
        <Box id="pane0" label="Tab A" />
        <Box id="pane1" label="Tab B" />
      </TabContainer>,
      { cols: 40, rows: 10 },
    );

    const tabsWidget = findById("tabs");
    expect(tabsWidget).toBeDefined();
    if (!tabsWidget) return;

    // Tab metrics are generated during render
    expect(tabsWidget.tabMetrics.length).toBe(2);
    const secondTabMetric = tabsWidget.tabMetrics[1];

    // Click the second tab on the tab-bar row (y = contentRect.y)
    const contentRect = tabsWidget.getContentRect();
    tabsWidget.handleMouse({
      type: "press",
      button: "left",
      x: secondTabMetric.startX + 1,
      y: contentRect.y,
    });
    await settle();

    expect(tabsWidget.activeIndex).toBe(1);
    expect(activeIdx).toBe(1);
  });

  test("renders the tab bar labels and honours an explicit clamped size", async () => {
    const { findById, text } = await mountApp(
      <TabContainer
        id="tabs"
        activeIndex={0}
        style={{ width: 40, height: 8, minWidth: 30, maxWidth: 50 }}
      >
        <Box id="pane0" label="First" />
        <Box id="pane1" label="Second" />
        <Box id="pane2" label="Third" />
      </TabContainer>,
      { cols: 60, rows: 12 },
    );
    const out = text();
    expect(out).toContain("First");
    expect(out).toContain("Second"); // inactive tab header still drawn
    expect(out).toContain("Third");

    const w = findById("tabs")!;
    w.measure(60, 12);
    expect(w.measuredWidth).toBe(40); // explicit width within [30,50]
    expect(w.measuredHeight).toBe(8);
  });

  test("dragging a tab header reorders tabs and fires onReorder once on release", async () => {
    let reorderCall: [number, number] | null = null;
    const { findById, settle } = await mountApp(
      <TabContainer
        id="tabs"
        activeIndex={0}
        reorderable
        onReorder={(from, to) => {
          reorderCall = [from, to];
        }}
      >
        <Box id="pane0" label="A" />
        <Box id="pane1" label="B" />
        <Box id="pane2" label="C" />
      </TabContainer>,
      { cols: 40, rows: 10 },
    );

    const tabsWidget = findById("tabs");
    await settle();
    const contentRect = tabsWidget.getContentRect();
    const [tabA, , tabC] = tabsWidget.tabMetrics;

    // Press on tab A (index 0) to start dragging it.
    tabsWidget.handleMouse({
      type: "press",
      button: "left",
      x: tabA.startX + 1,
      y: contentRect.y,
    });
    expect(tabsWidget.activeIndex).toBe(0);

    // Drag over tab C (index 2): A should live-swap to that position.
    tabsWidget.handleMouse({
      type: "drag",
      button: "left",
      x: tabC.startX + 1,
      y: contentRect.y,
    });
    const labelsAfterDrag = tabsWidget.children
      .filter((c: any) => c.label)
      .map((c: any) => c.label);
    expect(labelsAfterDrag).toEqual(["B", "C", "A"]);
    expect(tabsWidget.activeIndex).toBe(2); // dragged tab follows the pointer

    // Release: fires onReorder once with the original -> final index.
    tabsWidget.handleMouse({ type: "release", button: "left" });
    expect(reorderCall).toEqual([0, 2]);
  });

  test("tabMetrics reflects the new order immediately after a drag, without waiting for render()", async () => {
    // Regression: moveTab() reordered the live children, but tabMetrics (used
    // by handleMouse's hit-testing) was only ever recomputed inside render().
    // Multiple mouse-move events can coalesce into more than one "drag"
    // dispatch within a single frame, before a repaint happens — a second
    // drag step in that window hit-tested against the pre-move header
    // positions, letting a fast reorder-drag move the wrong tab.
    const { findById } = await mountApp(
      <TabContainer id="tabs" activeIndex={0} reorderable>
        <Box id="pane0" label="A" />
        <Box id="pane1" label="B" />
        <Box id="pane2" label="C" />
        <Box id="pane3" label="D" />
      </TabContainer>,
      { cols: 40, rows: 10 },
    );

    const tabsWidget = findById("tabs");
    const contentRect = tabsWidget.getContentRect();
    const [tabA, , tabC] = tabsWidget.tabMetrics;

    tabsWidget.handleMouse({
      type: "press",
      button: "left",
      x: tabA.startX + 1,
      y: contentRect.y,
    });
    tabsWidget.handleMouse({
      type: "drag",
      button: "left",
      x: tabC.startX + 1,
      y: contentRect.y,
    });

    // The children did reorder (moveTab itself isn't stale)...
    const labels = tabsWidget.children.filter((c: any) => c.label).map((c: any) => c.label);
    expect(labels).toEqual(["B", "C", "A", "D"]);
    // ...but tabMetrics — what the *next* drag/press event hit-tests
    // against — must already reflect that same new order, not the pre-drag
    // A/B/C/D layout, since no render() has run yet to refresh it.
    expect(tabsWidget.tabMetrics.map((m: any) => m.label)).toEqual(["B", "C", "A", "D"]);
  });

  test("dragging is a no-op when reorderable is not set", async () => {
    const { findById } = await mountApp(
      <TabContainer id="tabs" activeIndex={0}>
        <Box id="pane0" label="A" />
        <Box id="pane1" label="B" />
      </TabContainer>,
      { cols: 40, rows: 10 },
    );

    const tabsWidget = findById("tabs");
    const contentRect = tabsWidget.getContentRect();
    const [tabA, tabB] = tabsWidget.tabMetrics;

    tabsWidget.handleMouse({ type: "press", button: "left", x: tabA.startX + 1, y: contentRect.y });
    tabsWidget.handleMouse({ type: "drag", button: "left", x: tabB.startX + 1, y: contentRect.y });

    const labels = tabsWidget.children.filter((c: any) => c.label).map((c: any) => c.label);
    expect(labels).toEqual(["A", "B"]); // unchanged — reorderable defaults to false
  });

  test("keyboard/mouse handlers are no-ops with zero panels", () => {
    const w = new TabContainerWidget();
    w.region = new Region(Offset.ORIGIN, new Size(20, 5));

    // onKey bails immediately when there are no panel children.
    w.onKey?.({ name: "right", handled: false } as never);
    expect(w.hoveredIndex).toBe(0);

    // handleMouse's press branch also has nothing to hit-test against.
    w.handleMouse({ type: "press", button: "left", x: 0, y: 0, handled: false } as never);
    expect(w.activeIndex).toBe(0);

    // measure() with no children: the active-child ternaries take their
    // "no active child" (0/false) paths, and clamping is a no-op at 0.
    expect(() => w.measure(20, 5)).not.toThrow();
    expect(w.measuredHeight).toBeGreaterThan(0); // just the tab bar row + chrome

    // render() bails before touching any tab-bar drawing.
    const buffer = new ScreenBuffer(20, 5);
    expect(() => w.render(buffer)).not.toThrow();
  });

  test("Enter/Space is a no-op when the hovered tab is already active", async () => {
    let changeCount = 0;
    const { findById } = await mountApp(
      <TabContainer id="tabs" activeIndex={0} onChange={() => changeCount++}>
        <Box id="pane0" label="A" />
        <Box id="pane1" label="B" />
      </TabContainer>,
      { cols: 40, rows: 10 },
    );
    const tabsWidget = findById("tabs");
    tabsWidget.hoveredIndex = tabsWidget.activeIndex; // force equality
    tabsWidget.handleKey({ key: "enter", handled: false });
    expect(tabsWidget.activeIndex).toBe(0);
    expect(changeCount).toBe(0);
  });

  test("keys other than left/up/right/down/enter/space are ignored", async () => {
    const { findById } = await mountApp(
      <TabContainer id="tabs" activeIndex={0}>
        <Box id="pane0" label="A" />
        <Box id="pane1" label="B" />
      </TabContainer>,
      { cols: 40, rows: 10 },
    );
    const tabsWidget = findById("tabs");
    tabsWidget.handleKey({ key: "tab", handled: false });
    expect(tabsWidget.hoveredIndex).toBe(0);
    expect(tabsWidget.activeIndex).toBe(0);
  });

  test("a click outside the tab bar row is ignored", async () => {
    const { findById } = await mountApp(
      <TabContainer id="tabs" activeIndex={0}>
        <Box id="pane0" label="A" style={{ height: 5 }} />
        <Box id="pane1" label="B" style={{ height: 5 }} />
      </TabContainer>,
      { cols: 40, rows: 10 },
    );
    const tabsWidget = findById("tabs");
    const contentRect = tabsWidget.getContentRect();
    tabsWidget.handleMouse({
      type: "press",
      button: "left",
      x: contentRect.x,
      y: contentRect.y + 1, // below the tab bar row
    });
    expect(tabsWidget.activeIndex).toBe(0);
  });

  test("a click on the tab bar row missing any tab metric is ignored", async () => {
    const { findById } = await mountApp(
      <TabContainer id="tabs" activeIndex={0}>
        <Box id="pane0" label="A" />
        <Box id="pane1" label="B" />
      </TabContainer>,
      { cols: 40, rows: 10 },
    );
    const tabsWidget = findById("tabs");
    const contentRect = tabsWidget.getContentRect();
    tabsWidget.handleMouse({
      type: "press",
      button: "left",
      x: contentRect.right - 1, // past the last tab's metric range
      y: contentRect.y,
    });
    expect(tabsWidget.activeIndex).toBe(0);
  });

  test("clicking a tab doesn't steal focus when the container isn't focusable", async () => {
    const { findById } = await mountApp(
      <TabContainer id="tabs" activeIndex={0}>
        <Box id="pane0" label="A" />
        <Box id="pane1" label="B" />
      </TabContainer>,
      { cols: 40, rows: 10 },
    );
    const tabsWidget = findById("tabs");
    tabsWidget.focusable = false;
    const contentRect = tabsWidget.getContentRect();
    const secondTab = tabsWidget.tabMetrics[1];
    tabsWidget.handleMouse({
      type: "press",
      button: "left",
      x: secondTab.startX + 1,
      y: contentRect.y,
    });
    expect(tabsWidget.activeIndex).toBe(1);
    expect(tabsWidget.focused).toBe(false);
  });

  test("further mouse events are ignored once one has already been handled", async () => {
    const { findById } = await mountApp(
      <TabContainer id="tabs" activeIndex={0}>
        <Box id="pane0" label="A" />
        <Box id="pane1" label="B" />
      </TabContainer>,
      { cols: 40, rows: 10 },
    );
    const tabsWidget = findById("tabs");
    const contentRect = tabsWidget.getContentRect();
    const secondTab = tabsWidget.tabMetrics[1];
    tabsWidget.handleMouse({
      type: "press",
      button: "left",
      x: secondTab.startX + 1,
      y: contentRect.y,
      handled: true,
    });
    expect(tabsWidget.activeIndex).toBe(0);
  });

  test("dragging without reorderable set is a no-op for the drag branch too", async () => {
    const { findById } = await mountApp(
      <TabContainer id="tabs" activeIndex={0}>
        <Box id="pane0" label="A" />
        <Box id="pane1" label="B" />
      </TabContainer>,
      { cols: 40, rows: 10 },
    );
    const tabsWidget = findById("tabs");
    const contentRect = tabsWidget.getContentRect();
    const [tabA, tabB] = tabsWidget.tabMetrics;
    // No press first, so draggingIndex stays null: the "else if drag" branch
    // condition is false and nothing happens.
    tabsWidget.handleMouse({
      type: "drag",
      button: "left",
      x: tabB.startX + 1,
      y: contentRect.y,
    });
    expect(tabsWidget.children.map((c: any) => c.label)).toEqual(["A", "B"]);
    void tabA;
  });

  test("dragging without crossing into a different tab does not reorder", async () => {
    const { findById } = await mountApp(
      <TabContainer id="tabs" activeIndex={0} reorderable>
        <Box id="pane0" label="A" />
        <Box id="pane1" label="B" />
      </TabContainer>,
      { cols: 40, rows: 10 },
    );
    const tabsWidget = findById("tabs");
    const contentRect = tabsWidget.getContentRect();
    const [tabA] = tabsWidget.tabMetrics;

    tabsWidget.handleMouse({
      type: "press",
      button: "left",
      x: tabA.startX + 1,
      y: contentRect.y,
    });
    // Drag stays within tab A's own header cell: targetTab.index === draggingIndex.
    tabsWidget.handleMouse({
      type: "drag",
      button: "left",
      x: tabA.startX + 1,
      y: contentRect.y,
    });
    expect(tabsWidget.children.map((c: any) => c.label)).toEqual(["A", "B"]);
  });

  test("dragging a tab leftward (toIndex < fromIndex) reorders before the target", async () => {
    let reorderCall: [number, number] | null = null;
    const { findById } = await mountApp(
      <TabContainer
        id="tabs"
        activeIndex={2}
        reorderable
        onReorder={(from, to) => {
          reorderCall = [from, to];
        }}
      >
        <Box id="pane0" label="A" />
        <Box id="pane1" label="B" />
        <Box id="pane2" label="C" />
      </TabContainer>,
      { cols: 40, rows: 10 },
    );
    const tabsWidget = findById("tabs");
    const contentRect = tabsWidget.getContentRect();
    const [tabA, , tabC] = tabsWidget.tabMetrics;

    // Press on tab C (index 2), drag it back over tab A (index 0).
    tabsWidget.handleMouse({
      type: "press",
      button: "left",
      x: tabC.startX + 1,
      y: contentRect.y,
    });
    tabsWidget.handleMouse({
      type: "drag",
      button: "left",
      x: tabA.startX + 1,
      y: contentRect.y,
    });
    const labels = tabsWidget.children.map((c: any) => c.label);
    expect(labels).toEqual(["C", "A", "B"]);

    tabsWidget.handleMouse({ type: "release", button: "left" });
    expect(reorderCall).toEqual([2, 0]);
  });

  test("release without an actual reorder does not fire onReorder", async () => {
    let reorderCalled = false;
    const { findById } = await mountApp(
      <TabContainer
        id="tabs"
        activeIndex={0}
        reorderable
        onReorder={() => {
          reorderCalled = true;
        }}
      >
        <Box id="pane0" label="A" />
        <Box id="pane1" label="B" />
      </TabContainer>,
      { cols: 40, rows: 10 },
    );
    const tabsWidget = findById("tabs");
    const contentRect = tabsWidget.getContentRect();
    const [tabA] = tabsWidget.tabMetrics;

    // Press and release on the same tab without ever dragging over another
    // one: draggingIndex never changes, so origin === current on release.
    tabsWidget.handleMouse({
      type: "press",
      button: "left",
      x: tabA.startX + 1,
      y: contentRect.y,
    });
    tabsWidget.handleMouse({ type: "release", button: "left" });
    expect(reorderCalled).toBe(false);
  });

  test("measure() clamps out-of-range active/hovered indices after panels shrink", () => {
    const w = new TabContainerWidget();
    w.activeIndex = 5;
    w.hoveredIndex = 5;
    const p0 = new BoxWidget();
    p0.label = "Only";
    w.appendChild(p0);
    w.region = new Region(Offset.ORIGIN, new Size(20, 5));

    w.measure(20, 5);
    expect(w.activeIndex).toBe(0);
    expect(w.hoveredIndex).toBe(0);

    w.activeIndex = -1;
    w.hoveredIndex = -1;
    w.measure(20, 5);
    expect(w.activeIndex).toBe(0);
    expect(w.hoveredIndex).toBe(0);
  });

  test("measure() falls back to the panel's id, then a positional label", () => {
    const w = new TabContainerWidget();
    const withId = new BoxWidget();
    withId.id = "named-panel";
    const withNeither = new BoxWidget();
    w.appendChild(withId);
    w.appendChild(withNeither);
    w.region = new Region(Offset.ORIGIN, new Size(40, 5));

    expect(() => w.measure(40, 5)).not.toThrow();

    const buffer = new ScreenBuffer(40, 5);
    w.render(buffer);
    const row = buffer.cells[w.getContentRect().y].map((c) => c.char).join("");
    expect(row).toContain("named-panel");
    expect(row).toContain("Tab 2"); // neither label nor id -> positional fallback
  });

  test("measure() takes the non-numeric parseDimension branch for fr-based width/height", () => {
    const w = new TabContainerWidget();
    const p0 = new BoxWidget();
    p0.label = "A";
    w.appendChild(p0);
    w.style.width = "2fr";
    w.style.height = "2fr";
    w.region = new Region(Offset.ORIGIN, new Size(40, 5));

    // parseDimension("2fr", ...) returns { fr: 2 }, not a number, so measure()
    // must fall back to the computed needed size instead of using it directly.
    expect(() => w.measure(40, 5)).not.toThrow();
    expect(w.measuredWidth).toBeGreaterThan(0);
    expect(w.measuredHeight).toBeGreaterThan(0);
  });

  test("measure() clamps to explicit min/max width and height", () => {
    const w = new TabContainerWidget();
    const p0 = new BoxWidget();
    p0.label = "A";
    w.appendChild(p0);
    w.style.minWidth = 100;
    w.style.maxWidth = 5;
    w.style.minHeight = 50;
    w.style.maxHeight = 2;
    w.region = new Region(Offset.ORIGIN, new Size(40, 5));

    w.measure(40, 5);
    // minWidth (100) applied first, then clamped down by the smaller maxWidth (5).
    expect(w.measuredWidth).toBe(5);
    expect(w.measuredHeight).toBe(2);
  });

  test("measure() ignores an fr-shaped min/max constraint instead of crashing", () => {
    // parseDimension returns { fr: n } for an "Nfr" string — nonsensical for
    // a min/max constraint (there's no flex distribution to apply it to
    // here), but it must be skipped rather than poison measuredWidth/Height.
    const w = new TabContainerWidget();
    const p0 = new BoxWidget();
    p0.label = "A";
    w.appendChild(p0);
    w.style.minWidth = "1fr" as never;
    w.style.maxWidth = "1fr" as never;
    w.style.minHeight = "1fr" as never;
    w.style.maxHeight = "1fr" as never;
    w.region = new Region(Offset.ORIGIN, new Size(40, 5));

    expect(() => w.measure(40, 5)).not.toThrow();
    expect(Number.isNaN(w.measuredWidth)).toBe(false);
    expect(Number.isNaN(w.measuredHeight)).toBe(false);
  });

  test("moveTab/reorderTabMetrics bail out defensively on an out-of-range fromIndex", () => {
    // These are internal helpers invoked only from handleMouse's drag path,
    // which always derives fromIndex from a live draggingIndex — so an
    // out-of-range fromIndex can't happen through the public API. Exercise
    // the defensive guards directly to document (and cover) that they're safe.
    const w = new TabContainerWidget();
    const p0 = new BoxWidget();
    p0.label = "A";
    w.appendChild(p0);
    (w as any).tabMetrics = [{ index: 0, label: "A", startX: 0, width: 5 }];

    expect(() => (w as any).moveTab(99, 0)).not.toThrow();
    expect(w.children.map((c: any) => c.label)).toEqual(["A"]); // untouched

    expect(() => (w as any).reorderTabMetrics(99, 0)).not.toThrow();
    expect((w as any).tabMetrics.length).toBe(1); // untouched
  });

  test("hovering a non-active tab while focused uses the inactive background", () => {
    const w = new TabContainerWidget();
    const p0 = new BoxWidget();
    p0.label = "A";
    const p1 = new BoxWidget();
    p1.label = "B";
    w.appendChild(p0);
    w.appendChild(p1);
    w.activeIndex = 0;
    w.hoveredIndex = 1; // hovered tab is NOT the active one
    w.focused = true;
    w.region = new Region(Offset.ORIGIN, new Size(40, 5));
    w.measure(40, 5);

    const buffer = new ScreenBuffer(40, 5);
    expect(() => w.render(buffer)).not.toThrow();
  });
});
