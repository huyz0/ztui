import { useState } from "react";
import { describe, expect, test } from "vitest";
import { Spacing } from "../core.ts";
import { Button, Label, View } from "../react.ts";
import { mountApp, VTEDriver } from "./harness.tsx";

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
        hoverInterest
      >
        Clicks: {clicks}
      </Button>
    </View>
  );
}

/** Reads a row of the xterm-headless virtual terminal as a trimmed string. */
function line(driver: VTEDriver, y: number): string {
  return driver.terminal.buffer.active.getLine(y)?.translateToString(true) || "";
}

describe("Virtual Terminal Emulation (VTE) Integration", () => {
  test("Renders layout and reads buffer content", async () => {
    const { driver } = await mountApp(<InteractiveApp />);
    expect(line(driver, 0)).toContain("Normal Text");
  });

  test("Propagates mouse hover and resolves stylesheet dynamically in VTE", async () => {
    const { driver, screen, settle } = await mountApp(<InteractiveApp />);

    const btn = screen.children[0].children[1] as any;
    const hoverX = btn.region.x + Math.floor(btn.region.width / 2);
    const hoverY = btn.region.y + Math.floor(btn.region.height / 2);

    // Mouse enters the button
    driver.simulateMouse(hoverX, hoverY, "move", "none");
    await settle();

    expect(line(driver, 0)).toContain("Hovered Active");

    // The hovered label cell should be bold and strikethrough
    const cell = driver.terminal.buffer.active.getLine(0)?.getCell(0);
    expect(cell).toBeDefined();
    if (cell) {
      expect(cell.isBold()).toBeTruthy();
      expect(cell.isStrikethrough()).toBeTruthy();
    }

    // Mouse leaves. Pointer-move processing is throttled (~15 Hz), so wait past
    // the coalescing window for the trailing move to be applied.
    driver.simulateMouse(39, 9, "move", "none");
    await settle(90);
    expect(line(driver, 0)).toContain("Normal Text");
  });

  test("Propagates clicks and keyboard events in PTY/VTE", async () => {
    const { driver, screen, settle } = await mountApp(<InteractiveApp />);

    const btn = screen.children[0].children[1] as any;
    const clickX = btn.region.x + Math.floor(btn.region.width / 2);
    const clickY = btn.region.y + Math.floor(btn.region.height / 2);

    driver.simulateMouse(clickX, clickY, "press", "left");
    await settle();

    expect(line(driver, btn.region.y)).toContain("Clicks: 1");
  });

  test("Exercises all methods of VTEDriver to ensure 100% function coverage", async () => {
    const driver = new VTEDriver(80, 24);
    driver.start();
    driver.stop();

    driver.clipboard.set("test-clipboard");
    expect(await driver.clipboard.get()).toBe("test-clipboard");

    driver.showNotification("Title", "Message");
    expect(driver.writtenData).toContain("Title");

    await driver.writeAsync("async-write");
    expect(driver.writtenData).toContain("async-write");

    await driver.waitWrite();

    let keyCalled = false;
    driver.on("key", () => {
      keyCalled = true;
    });
    driver.simulateKey("x");
    expect(keyCalled).toBe(true);

    let mouseCalled = false;
    driver.on("mouse", () => {
      mouseCalled = true;
    });
    driver.simulateMouse(1, 1, "press", "left");
    expect(mouseCalled).toBe(true);

    const size = driver.getSize();
    expect(size.width).toBe(80);
    expect(size.height).toBe(24);
  });

  test("Clamps canvas to minimum of 80x24 and clips output correctly for a small driver", async () => {
    const { app, driver, screen } = await mountApp(
      <View style={{ layout: "vertical", width: 80, height: 24 }}>
        <Label id="label1">Line 1 Content</Label>
        <Label id="label2" style={{ margin: new Spacing(15, 0, 0, 0) }}>
          Line 16 Content
        </Label>
      </View>,
      { cols: 30, rows: 10 },
    );

    // The virtual screen and buffers should have resolved to the 80x24 minimum.
    expect(screen.region.width).toBe(80);
    expect(screen.region.height).toBe(24);
    expect(app.buffer.width).toBe(80);
    expect(app.buffer.height).toBe(24);

    // "Line 1 Content" is within the physical 30x10 viewport, so it is visible.
    expect(line(driver, 0)).toContain("Line 1 Content");

    // "Line 16 Content" sits at y=16 (margin-top 15), outside the physical height
    // 10, so it must be clipped from the terminal buffer.
    for (let y = 0; y < 10; y++) {
      expect(line(driver, y)).not.toContain("Line 16 Content");
    }
  });
});
