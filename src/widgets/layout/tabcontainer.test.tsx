import { describe, expect, test } from "vitest";
import { Box, TabContainer } from "../../react.ts";
import { mountApp } from "../../test/harness.tsx";

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
});
