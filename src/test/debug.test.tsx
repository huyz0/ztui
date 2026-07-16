import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { App, MockDriver, renderBufferToHTML, renderBufferToText } from "../core.ts";
import {
  Box,
  Button,
  Dock,
  Footer,
  Grid,
  HBox,
  Header,
  Input,
  Label,
  render,
  VBox,
  View,
} from "../react.ts";
import { waitFor } from "./harness.tsx";

function SimpleTestApp() {
  const [count, setCount] = useState(0);

  return (
    <View style={{ layout: "vertical", width: 40, height: 10 }}>
      <Label>Counter: {count}</Label>
      <Button id="btn" onClick={() => setCount(count + 1)}>
        Increment
      </Button>
    </View>
  );
}

describe("first-class isolated debugging", () => {
  test("MockDriver isolated rendering and HTML output", async () => {
    const driver = new MockDriver(40, 10);
    const app = new App(driver);

    render(<SimpleTestApp />, app.activeScreen);
    app.run();

    // Wait for React commit and microtask render queue to flush
    await waitFor(() => renderBufferToHTML((app as any).currentBuffer).includes("Counter: 0"));

    const html = renderBufferToHTML((app as any).currentBuffer);

    expect(html.includes("Counter: 0")).toBe(true);
    expect(html.includes("Increment")).toBe(true);

    app.stop();
  });

  test("Programmatic input simulation (keyboard focus & mouse click)", async () => {
    const driver = new MockDriver(40, 10);
    const app = new App(driver);

    render(<SimpleTestApp />, app.activeScreen);
    app.run();

    // Wait for initial render
    await waitFor(() => app.activeScreen.children.length > 0);

    expect(app.activeScreen.focusedWidget).toBeNull();

    // Simulate Tab key to cycle focus to the button
    driver.simulateKey("tab");

    // Wait for key event processing and render queue
    await waitFor(() => app.activeScreen.focusedWidget !== null);

    expect(app.activeScreen.focusedWidget).not.toBeNull();
    expect(app.activeScreen.focusedWidget!.tagName).toBe("button");

    const btn = app.activeScreen.children[0].children[1] as any;
    expect(btn.tagName).toBe("button");

    // Click the center of the button
    const clickX = btn.region.x + Math.floor(btn.region.width / 2);
    const clickY = btn.region.y + Math.floor(btn.region.height / 2);

    driver.simulateMouse(clickX, clickY, "press", "left");

    // Wait for click event state change and microtask render
    await waitFor(() => renderBufferToHTML((app as any).currentBuffer).includes("Counter: 1"));

    const html = renderBufferToHTML((app as any).currentBuffer);
    expect(html.includes("Counter: 1")).toBe(true);

    // Simulate Enter key on focused button
    driver.simulateKey("enter");

    // Wait for key event and state change
    await waitFor(() => renderBufferToHTML((app as any).currentBuffer).includes("Counter: 2"));

    const htmlAfterEnter = renderBufferToHTML((app as any).currentBuffer);
    expect(htmlAfterEnter.includes("Counter: 2")).toBe(true);

    app.stop();
  });

  test("HTTP Inspector Server API (GET /dom, GET /render, POST /input)", async () => {
    const driver = new MockDriver(40, 10);
    const app = new App(driver);

    render(<SimpleTestApp />, app.activeScreen);
    app.run({ inspectorPort: 8081 });

    // Wait for render
    await waitFor(() => app.activeScreen.children.length > 0);

    // 1. Test GET /dom
    const domRes = await fetch("http://localhost:8081/dom");
    expect(domRes.status).toBe(200);
    const domData: any = await domRes.json();
    expect(domData.tagName).toBe("screen");
    expect(domData.children[0].tagName).toBe("view");
    expect(domData.children[0].children[0].tagName).toBe("label");

    // 2. Test GET /render
    const renderRes = await fetch("http://localhost:8081/render");
    expect(renderRes.status).toBe(200);
    const html = await renderRes.text();
    expect(html.includes("Counter: 0")).toBe(true);

    // 3. Test POST /input (mouse click simulation)
    const btn = app.activeScreen.children[0].children[1] as any;
    const clickX = btn.region.x + Math.floor(btn.region.width / 2);
    const clickY = btn.region.y + Math.floor(btn.region.height / 2);

    const inputRes = await fetch("http://localhost:8081/input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "mouse",
        x: clickX,
        y: clickY,
        action: "press",
        button: "left",
      }),
    });
    expect(inputRes.status).toBe(200);
    const inputData: any = await inputRes.json();
    expect(inputData.status).toBe("ok");

    // Wait for click event state change and microtask render
    await waitFor(() => renderBufferToHTML((app as any).currentBuffer).includes("Counter: 1"));

    // Query render again to verify state update
    const renderRes2 = await fetch("http://localhost:8081/render");
    const html2 = await renderRes2.text();
    expect(html2.includes("Counter: 1")).toBe(true);

    app.stop();
  });

  test("Shift-Tab focus navigation (reverse focus cycling)", async () => {
    const driver = new MockDriver(40, 10);
    const app = new App(driver);

    render(
      <View style={{ layout: "vertical", width: 40, height: 10 }}>
        <Button id="btn1">Button 1</Button>
        <Button id="btn2">Button 2</Button>
      </View>,
      app.activeScreen,
    );
    app.run();

    await waitFor(() => app.activeScreen.children.length > 0);

    // Cycle focus forward (first Tab -> focuses btn1)
    driver.simulateKey("tab", "tab", false, false); // shift=false
    await waitFor(() => app.activeScreen.focusedWidget?.id === "btn1");
    expect(app.activeScreen.focusedWidget?.id).toBe("btn1");

    // Cycle focus forward (second Tab -> focuses btn2)
    driver.simulateKey("tab", "tab", false, false);
    await waitFor(() => app.activeScreen.focusedWidget?.id === "btn2");
    expect(app.activeScreen.focusedWidget?.id).toBe("btn2");

    // Cycle focus backward (Shift-Tab -> focuses btn1 again)
    driver.simulateKey("tab", "tab", false, true); // shift=true
    await waitFor(() => app.activeScreen.focusedWidget?.id === "btn1");
    expect(app.activeScreen.focusedWidget?.id).toBe("btn1");

    // Cycle focus backward (Shift-Tab -> focuses btn2 via wrap-around)
    driver.simulateKey("tab", "tab", false, true);
    await waitFor(() => app.activeScreen.focusedWidget?.id === "btn2");
    expect(app.activeScreen.focusedWidget?.id).toBe("btn2");

    app.stop();
  });

  test("Mouse click focusing a text input shows caret", async () => {
    const driver = new MockDriver(40, 10);
    const app = new App(driver);

    render(
      <View style={{ layout: "vertical", width: 40, height: 10 }}>
        <Input id="inp" value="test" />
      </View>,
      app.activeScreen,
    );
    app.run();

    await waitFor(() => app.activeScreen.children.length > 0);

    // Verify input is not focused initially (no caret '█' in render). The text
    // render preserves the literal glyph (the HTML backend draws █ as a CSS fill).
    const textBefore = renderBufferToText((app as any).currentBuffer);
    expect(textBefore.includes("█")).toBe(false);

    // Click on the input box
    const inp = app.activeScreen.children[0].children[0] as any;
    const clickX = inp.region.x + Math.floor(inp.region.width / 2);
    const clickY = inp.region.y + Math.floor(inp.region.height / 2);
    driver.simulateMouse(clickX, clickY, "press", "left");

    // Wait for event queue & render microtask
    await waitFor(() => renderBufferToText((app as any).currentBuffer).includes("█"));

    // Now it should be focused and show the caret
    const textAfter = renderBufferToText((app as any).currentBuffer);
    expect(textAfter.includes("test")).toBe(true);
    expect(textAfter.includes("█")).toBe(true);

    app.stop();
  });

  test("React layout components and widgets rendering", async () => {
    const driver = new MockDriver(40, 10);
    const app = new App(driver);

    render(
      <Dock style={{ width: 40, height: 10 }}>
        <Header>Custom Title</Header>
        <VBox style={{ height: 8 }}>
          <HBox style={{ height: 4 }}>
            <Label style={{ width: "1fr" }}>HBox Text</Label>
          </HBox>
          <Grid style={{ height: 4 }}>
            <Label>Grid Text</Label>
          </Grid>
        </VBox>
        <Footer />
      </Dock>,
      app.activeScreen,
    );
    app.run();

    await waitFor(() => renderBufferToHTML((app as any).currentBuffer).includes("Custom Title"));

    const html = renderBufferToHTML((app as any).currentBuffer);

    // Verify Custom Title (Header) is rendered
    expect(html.includes("Custom Title")).toBe(true);

    // Verify VBox and HBox elements are present and rendered
    expect(html.includes("HBox Text")).toBe(true);

    // Verify Grid is rendered
    expect(html.includes("Grid Text")).toBe(true);

    // Verify default Footer text is rendered
    expect(html.includes("Ctrl+C Exit  │  Tab Cycle Focus")).toBe(true);

    app.stop();
  });

  test("React Box Flexbox layout and flexGrow rendering", async () => {
    const driver = new MockDriver(40, 10);
    const app = new App(driver);

    render(
      <Box style={{ display: "flex", flexDirection: "row", width: 40, height: 10 }}>
        <Label style={{ flexGrow: 1 }}>Box Left</Label>
        <Label style={{ flexGrow: 1 }}>Box Right</Label>
      </Box>,
      app.activeScreen,
    );
    app.run();

    await waitFor(() => renderBufferToHTML((app as any).currentBuffer).includes("Box Left"));

    const html = renderBufferToHTML((app as any).currentBuffer);

    // Both should be visible and rendered side-by-side
    expect(html.includes("Box Left")).toBe(true);
    expect(html.includes("Box Right")).toBe(true);

    app.stop();
  });

  test("Mouse hover events (onMouseEnter & onMouseLeave)", async () => {
    const driver = new MockDriver(40, 10);
    const app = new App(driver);

    let enterCount = 0;
    let leaveCount = 0;

    render(
      <View style={{ layout: "vertical", width: 40, height: 10 }}>
        <Button
          id="btn-hover"
          hoverInterest
          onMouseEnter={() => {
            enterCount++;
          }}
          onMouseLeave={() => {
            leaveCount++;
          }}
        >
          Hover Me
        </Button>
      </View>,
      app.activeScreen,
    );
    app.run();

    await waitFor(() => app.activeScreen.children.length > 0);

    const btn = app.activeScreen.children[0].children[0] as any;
    expect(btn.tagName).toBe("button");

    const clickX = btn.region.x + Math.floor(btn.region.width / 2);
    const clickY = btn.region.y + Math.floor(btn.region.height / 2);

    // Hover over the button (mouse move event)
    driver.simulateMouse(clickX, clickY, "move", "none");
    await waitFor(() => enterCount === 1);

    // Move mouse away to coordinates (39, 9)
    driver.simulateMouse(39, 9, "move", "none");
    await waitFor(() => leaveCount === 1);

    expect(enterCount).toBe(1);
    expect(leaveCount).toBe(1);

    app.stop();
  });

  test("App Ctrl+C safety exit handler", async () => {
    const driver = new MockDriver(40, 10);
    const app = new App(driver);
    app.run();

    const originalExit = process.exit;
    const mockExit = vi.fn();
    process.exit = mockExit as any;

    try {
      driver.simulateKey("ctrl+c", "c", true, false);
      expect(mockExit).toHaveBeenCalledWith(0);
    } finally {
      process.exit = originalExit;
      app.stop();
    }
  });
});
