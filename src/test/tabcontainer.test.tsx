import { describe, expect, test } from "vitest";
import { App, Box, render, TabContainer } from "../index.ts";
import { VTEDriver } from "./vte-runner.ts";

function findWidgetById(screen: any, id: string): any {
  let found: any;
  screen.walk((n: any) => {
    if (n.id === id) found = n;
  });
  return found;
}

describe("TabContainer Widget Suite", () => {
  test("TabContainer active tab toggles visibility and positions child", async () => {
    const driver = new VTEDriver(40, 10);
    const app = new App(driver);

    render(
      <TabContainer id="tabs" activeIndex={0}>
        <Box id="pane0" label="First Tab" style={{ height: 5 }}>
          First Pane Content
        </Box>
        <Box id="pane1" label="Second Tab" style={{ height: 5 }}>
          Second Pane Content
        </Box>
      </TabContainer>,
      app.activeScreen,
    );

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const tabsWidget = findWidgetById(app.activeScreen, "tabs");
    const pane0 = findWidgetById(app.activeScreen, "pane0");
    const pane1 = findWidgetById(app.activeScreen, "pane1");

    expect(tabsWidget).toBeDefined();
    expect(pane0).toBeDefined();
    expect(pane1).toBeDefined();

    // Verify initial visible state
    expect(pane0.visible).toBe(true);
    expect(pane1.visible).toBe(false);

    // Verify layout positioning
    // pane0 should start at y = tabs.region.y + 1 (tabBarHeight)
    const tabsRect = tabsWidget.getContentRect();
    expect(pane0.region.y).toBe(tabsRect.y + 1);

    app.stop();
  });

  test("Keyboard arrow navigation and selection", async () => {
    let activeIdx = 0;
    const driver = new VTEDriver(40, 10);
    const app = new App(driver);

    render(
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
      app.activeScreen,
    );

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const tabsWidget = findWidgetById(app.activeScreen, "tabs");
    app.activeScreen.focusWidget(tabsWidget);
    expect(tabsWidget.focused).toBe(true);

    // Default state: index 0
    expect(tabsWidget.hoveredIndex).toBe(0);
    expect(tabsWidget.activeIndex).toBe(0);

    // Press right arrow -> should change hoveredIndex to 1
    tabsWidget.handleKey({ key: "right" });
    expect(tabsWidget.hoveredIndex).toBe(1);
    expect(tabsWidget.activeIndex).toBe(0); // activeIndex hasn't changed yet

    // Press Enter to select
    tabsWidget.handleKey({ key: "enter" });
    expect(tabsWidget.activeIndex).toBe(1);
    expect(activeIdx).toBe(1);

    // Press down arrow -> should change hoveredIndex to 2
    tabsWidget.handleKey({ key: "down" });
    expect(tabsWidget.hoveredIndex).toBe(2);

    // Press Space to select
    tabsWidget.handleKey({ key: "space" });
    expect(tabsWidget.activeIndex).toBe(2);
    expect(activeIdx).toBe(2);

    // Press left arrow -> hoveredIndex back to 1
    tabsWidget.handleKey({ key: "left" });
    expect(tabsWidget.hoveredIndex).toBe(1);

    // Press Space key to select
    tabsWidget.handleKey({ key: " " });
    expect(tabsWidget.activeIndex).toBe(1);
    expect(activeIdx).toBe(1);

    app.stop();
  });

  test("Mouse click switches tabs", async () => {
    let activeIdx = 0;
    const driver = new VTEDriver(40, 10);
    const app = new App(driver);

    render(
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
      app.activeScreen,
    );

    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const tabsWidget = findWidgetById(app.activeScreen, "tabs");

    // Check that we generated tabMetrics
    expect(tabsWidget.tabMetrics.length).toBe(2);
    const secondTabMetric = tabsWidget.tabMetrics[1];

    // Simulate clicking on the second tab's x coordinate on the tab bar row (y = contentRect.y)
    const contentRect = tabsWidget.getContentRect();
    tabsWidget.handleMouse({
      type: "press",
      button: "left",
      x: secondTabMetric.startX + 1,
      y: contentRect.y,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(tabsWidget.activeIndex).toBe(1);
    expect(activeIdx).toBe(1);

    app.stop();
  });
});
