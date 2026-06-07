import React, { useState } from "react";
import { describe, expect, test } from "vitest";
import { App, Button, Label, Spacing, View, render } from "../index.ts";
import { VTEDriver } from "./vte-runner.ts";

function InteractiveApp() {
  const [hovered, setHovered] = useState(false);
  const [clicks, setClicks] = useState(0);

  return (
    <View style={{ layout: "vertical", width: 40, height: 10 }}>
      <Label style={{ bold: true, strikethrough: hovered }}>
        {hovered ? "Hovered Active" : "Normal Text"}
      </Label>
      <Button
        id="btn"
        onClick={() => setClicks(clicks + 1)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        Clicks: {clicks}
      </Button>
    </View>
  );
}

describe("Virtual Terminal Emulation (VTE) Integration", () => {
  test("Renders layout and reads buffer content", async () => {
    const driver = new VTEDriver(80, 24);
    const app = new App(driver);

    render(<InteractiveApp />, app.activeScreen);
    app.run();

    // Wait for render update
    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    // Verify initial text in virtual terminal buffer
    const line0 = driver.terminal.buffer.active.getLine(0)?.translateToString(true) || "";
    expect(line0).toContain("Normal Text");

    app.stop();
  });

  test("Propagates mouse hover and resolves stylesheet dynamically in VTE", async () => {
    const driver = new VTEDriver(80, 24);
    const app = new App(driver);

    render(<InteractiveApp />, app.activeScreen);
    app.run();

    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    const btn = app.activeScreen.children[0].children[1] as any;
    const hoverX = btn.region.x + Math.floor(btn.region.width / 2);
    const hoverY = btn.region.y + Math.floor(btn.region.height / 2);

    // Simulate mouse entering the button
    driver.simulateMouse(hoverX, hoverY, "move", "none");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    // Text on line 0 should transition to "Hovered Active"
    const line0AfterHover = driver.terminal.buffer.active.getLine(0)?.translateToString(true) || "";
    expect(line0AfterHover).toContain("Hovered Active");

    // Retrieve cell style parameters from xterm-headless
    const cell = driver.terminal.buffer.active.getLine(0)?.getCell(0);
    expect(cell).toBeDefined();
    if (cell) {
      // The cell should be bold and strikethrough
      expect(cell.isBold()).toBeTruthy();
      expect(cell.isStrikethrough()).toBeTruthy();
    }

    // Simulate mouse leaving
    driver.simulateMouse(39, 9, "move", "none");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    const line0AfterLeave = driver.terminal.buffer.active.getLine(0)?.translateToString(true) || "";
    expect(line0AfterLeave).toContain("Normal Text");

    app.stop();
  });

  test("Propagates clicks and keyboard events in PTY/VTE", async () => {
    const driver = new VTEDriver(80, 24);
    const app = new App(driver);

    render(<InteractiveApp />, app.activeScreen);
    app.run();

    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    const btn = app.activeScreen.children[0].children[1] as any;
    const clickX = btn.region.x + Math.floor(btn.region.width / 2);
    const clickY = btn.region.y + Math.floor(btn.region.height / 2);

    // Click button
    driver.simulateMouse(clickX, clickY, "press", "left");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    // Verify click count increment
    const buttonLine =
      driver.terminal.buffer.active.getLine(btn.region.y)?.translateToString(true) || "";
    expect(buttonLine).toContain("Clicks: 1");

    app.stop();
  });

  test("Exercises all methods of VTEDriver to ensure 100% function coverage", async () => {
    const driver = new VTEDriver(80, 24);
    driver.start();
    driver.stop();

    // clipboard
    driver.clipboard.set("test-clipboard");
    const text = await driver.clipboard.get();
    expect(text).toBe("test-clipboard");

    // notifications
    driver.showNotification("Title", "Message");
    expect(driver.writtenData).toContain("Title");

    // writeAsync
    await driver.writeAsync("async-write");
    expect(driver.writtenData).toContain("async-write");

    // waitWrite
    await driver.waitWrite();

    // simulateKey
    let keyCalled = false;
    driver.on("key", () => {
      keyCalled = true;
    });
    driver.simulateKey("x");
    expect(keyCalled).toBe(true);

    // simulateMouse
    let mouseCalled = false;
    driver.on("mouse", () => {
      mouseCalled = true;
    });
    driver.simulateMouse(1, 1, "press", "left");
    expect(mouseCalled).toBe(true);

    // size
    const size = driver.getSize();
    expect(size.width).toBe(80);
    expect(size.height).toBe(24);
  });

  test("Clamps canvas to minimum of 80x24 and clips output correctly for a small driver", async () => {
    const driver = new VTEDriver(30, 10);
    const app = new App(driver);

    render(
      <View style={{ layout: "vertical", width: 80, height: 24 }}>
        <Label id="label1">Line 1 Content</Label>
        <Label id="label2" style={{ margin: new Spacing(15, 0, 0, 0) }}>
          Line 16 Content
        </Label>
      </View>,
      app.activeScreen,
    );
    app.run();

    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    // The virtual screen and buffers should have resolved to 80x24 minimum
    expect(app.activeScreen.region.width).toBe(80);
    expect(app.activeScreen.region.height).toBe(24);

    const buffer = (app as any).currentBuffer;
    expect(buffer.width).toBe(80);
    expect(buffer.height).toBe(24);

    // Line 0 ("Line 1 Content") is within physical height (10) and width (30), so it should be visible in the virtual terminal
    const terminalLine0 = driver.terminal.buffer.active.getLine(0)?.translateToString(true) || "";
    expect(terminalLine0).toContain("Line 1 Content");

    // Line 16 ("Line 16 Content") is at y = 16 (since margin-top is 15), which is outside the physical height (10).
    // It should be clipped and therefore NOT written to the driver's terminal buffer.
    for (let y = 0; y < 10; y++) {
      const lineText = driver.terminal.buffer.active.getLine(y)?.translateToString(true) || "";
      expect(lineText).not.toContain("Line 16 Content");
    }

    app.stop();
  });
});
