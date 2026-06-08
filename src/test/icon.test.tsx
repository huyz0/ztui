import { describe, expect, test } from "vitest";
import { App, HeroIcon, Icon, iconRegistry, render, VBox } from "../index.ts";
import { parseColorToRGB } from "../widgets/icon-registry.ts";
import { VTEDriver } from "./vte-runner.ts";

const mockSvg = `
<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" fill="currentColor"/>
</svg>
`;

describe("SVG Icon Support Engine", () => {
  test("Registers custom SVG icons and maps them to PUA codepoints", () => {
    iconRegistry.registerIcon({
      name: "test-home",
      svg: mockSvg,
      textFallback: "🏠",
    });

    const icon = iconRegistry.get("test-home");
    expect(icon).toBeDefined();
    expect(icon?.textFallback).toBe("🏠");

    const codepoint = iconRegistry.getCodepoint("test-home");
    expect(codepoint).toBeGreaterThanOrEqual(0xe000);
  });

  test("Renders Glyph Protocol character code when supported", async () => {
    const driver = new VTEDriver(40, 10, {
      glyphProtocol: true,
      graphicsProtocol: "none",
    });
    const app = new App(driver);

    render(<Icon name="test-home" style={{ color: "red" }} />, app.activeScreen);

    app.run();

    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    // Verify internal buffer cells
    const buffer = (app as any).currentBuffer;
    const cell0 = buffer.cells[0][0];
    const cell1 = buffer.cells[0][1];

    const cp = iconRegistry.getCodepoint("test-home");
    expect(cell0.char).toBe("🏠");
    expect(cell0.icon).toBe("test-home");
    expect(cell1.wideContinuation).toBe(true);

    // Verify it was written to the terminal driver
    expect(driver.writtenData).toContain(String.fromCodePoint(cp!));

    app.stop();
  });

  test("Renders Kitty inline graphics when supported", async () => {
    const driver = new VTEDriver(40, 10, {
      glyphProtocol: false,
      graphicsProtocol: "kitty",
    });
    const app = new App(driver);

    render(<Icon name="test-home" style={{ color: "blue" }} />, app.activeScreen);

    app.run();

    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    // Verify internal buffer cells
    const buffer = (app as any).currentBuffer;
    const cell0 = buffer.cells[0][0];
    const cell1 = buffer.cells[0][1];

    expect(cell0.char).toBe("🏠");
    expect(cell0.icon).toBe("test-home");
    expect(cell1.wideContinuation).toBe(true);

    // Verify exact ESC sequence written to terminal
    expect(driver.writtenData).toContain("\x1b_Gf=100,a=T,t=d,s=16,v=16,c=2,r=1;");
    expect(driver.writtenData).toContain("\x1b\\");

    app.stop();
  });

  test("Renders iTerm2 inline graphics when supported", async () => {
    const driver = new VTEDriver(40, 10, {
      glyphProtocol: false,
      graphicsProtocol: "iterm2",
    });
    const app = new App(driver);

    render(<Icon name="test-home" style={{ color: "blue" }} />, app.activeScreen);

    app.run();

    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    // Verify internal buffer cells
    const buffer = (app as any).currentBuffer;
    const cell0 = buffer.cells[0][0];
    const cell1 = buffer.cells[0][1];

    expect(cell0.char).toBe("🏠");
    expect(cell0.icon).toBe("test-home");
    expect(cell1.wideContinuation).toBe(true);

    // Verify exact ESC sequence written to terminal
    expect(driver.writtenData).toContain("\x1b]1337;File=inline=1;width=2;height=1:");
    expect(driver.writtenData).toContain("\x07");

    app.stop();
  });

  test("Renders dynamically colored Sixel graphics when supported", async () => {
    const driver = new VTEDriver(40, 10, {
      glyphProtocol: false,
      graphicsProtocol: "sixel",
    });
    const app = new App(driver);

    render(<Icon name="test-home" style={{ color: "#ff0000" }} />, app.activeScreen);

    app.run();

    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    // Verify internal buffer cells
    const buffer = (app as any).currentBuffer;
    const cell0 = buffer.cells[0][0];
    const cell1 = buffer.cells[0][1];

    expect(cell0.char).toBe("🏠");
    expect(cell0.icon).toBe("test-home");
    expect(cell1.wideContinuation).toBe(true);

    // Verify Sixel colors and terminator in written data
    expect(driver.writtenData).toContain("\x1bPq");
    expect(driver.writtenData).toContain("#15;2;100;0;0");
    expect(driver.writtenData).toContain("\x1b\\");

    app.stop();
  });

  test("Falls back to unicode text when no graphics protocol is supported", async () => {
    const driver = new VTEDriver(40, 10, {
      glyphProtocol: false,
      graphicsProtocol: "none",
    });
    const app = new App(driver);

    render(<Icon name="test-home" style={{ color: "green" }} />, app.activeScreen);

    app.run();

    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    // Verify internal buffer cells
    const buffer = (app as any).currentBuffer;
    const cell0 = buffer.cells[0][0];
    const cell1 = buffer.cells[0][1];

    // 🏠 is wide (width 2)
    expect(cell0.char).toBe("🏠");
    expect(cell1.wideContinuation).toBe(true);

    expect(driver.writtenData).toContain("🏠");

    app.stop();
  });

  test("Resolves and registers Heroicons dynamically via HeroIcon component", async () => {
    const driver = new VTEDriver(40, 10, {
      glyphProtocol: false,
      graphicsProtocol: "sixel",
    });
    const app = new App(driver);

    // Render solid beaker
    render(
      <HeroIcon name="beaker" variant="solid" style={{ color: "yellow" }} />,
      app.activeScreen,
    );
    app.run();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await driver.waitWrite();

    // Verify it registered hero:solid:beaker in the registry
    const icon = iconRegistry.get("hero:solid:beaker");
    expect(icon).toBeDefined();
    expect(icon?.textFallback).toBe("🧪");
    expect(icon?.svg).toContain('viewBox="0 0 24 24"');

    // Verify Sixel is generated for it
    expect(driver.writtenData).toContain("\x1bPq");

    app.stop();
  });

  test("Supports other HeroIcon variants (outline, mini, micro)", async () => {
    const driver = new VTEDriver(40, 10, {
      glyphProtocol: false,
      graphicsProtocol: "none",
    });
    const app = new App(driver);

    render(
      <VBox>
        <HeroIcon name="heart" variant="outline" />
        <HeroIcon name="bell" variant="mini" />
        <HeroIcon name="home" variant="micro" />
      </VBox>,
      app.activeScreen,
    );
    app.run();

    await new Promise((resolve) => setTimeout(resolve, 20));
    app.stop();

    const iconOutline = iconRegistry.get("hero:outline:heart");
    expect(iconOutline).toBeDefined();
    expect(iconOutline?.svg).toContain('stroke="currentColor"');
    expect(iconOutline?.textFallback).toBe("❤️");

    const iconMini = iconRegistry.get("hero:mini:bell");
    expect(iconMini).toBeDefined();
    expect(iconMini?.svg).toContain('viewBox="0 0 20 20"');
    expect(iconMini?.textFallback).toBe("🔔");

    const iconMicro = iconRegistry.get("hero:micro:home");
    expect(iconMicro).toBeDefined();
    expect(iconMicro?.svg).toContain('viewBox="0 0 16 16"');
    expect(iconMicro?.textFallback).toBe("🏠");
  });

  test("parseColorToRGB parses different formats", () => {
    expect(parseColorToRGB("#abc")).toEqual({ r: 170, g: 187, b: 204 });
    expect(parseColorToRGB("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseColorToRGB("invalid-color-name")).toEqual({ r: 255, g: 255, b: 255 });
  });
});
