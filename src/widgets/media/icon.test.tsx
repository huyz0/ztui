import { describe, expect, test } from "vitest";
import { HeroIcon, Icon, iconRegistry, VBox } from "../../index.ts";
import { parseColorToRGB } from "../../render/icon-registry.ts";
import { mountApp } from "../../test/harness.tsx";

const mockSvg = `
<svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" fill="currentColor"/>
</svg>
`;

/** Asserts the home icon occupies (0,0) as a wide glyph with its continuation at (1,0). */
function expectHomeGlyph(cellAt: (x: number, y: number) => any) {
  const cell0 = cellAt(0, 0);
  const cell1 = cellAt(1, 0);
  expect(cell0.char).toBe("🏠");
  expect(cell0.icon).toBe("test-home");
  expect(cell1.wideContinuation).toBe(true);
}

describe("SVG Icon Support Engine", () => {
  test("Registers custom SVG icons and maps them to PUA codepoints", () => {
    iconRegistry.registerIcon({ name: "test-home", svg: mockSvg, textFallback: "🏠" });

    const icon = iconRegistry.get("test-home");
    expect(icon).toBeDefined();
    expect(icon?.textFallback).toBe("🏠");
    expect(iconRegistry.getCodepoint("test-home")).toBeGreaterThanOrEqual(0xe000);
  });

  test("Renders Glyph Protocol character code when supported", async () => {
    iconRegistry.registerIcon({ name: "test-home", svg: mockSvg, textFallback: "🏠" });
    const { driver, cellAt } = await mountApp(<Icon name="test-home" style={{ color: "red" }} />, {
      cols: 40,
      rows: 10,
      capabilities: { glyphProtocol: true, graphicsProtocol: "none" },
    });

    expectHomeGlyph(cellAt);
    const cp = iconRegistry.getCodepoint("test-home");
    expect(driver.writtenData).toContain(String.fromCodePoint(cp!));
  });

  test("Renders Kitty inline graphics when supported", async () => {
    iconRegistry.registerIcon({ name: "test-home", svg: mockSvg, textFallback: "🏠" });
    const { driver, cellAt } = await mountApp(<Icon name="test-home" style={{ color: "blue" }} />, {
      cols: 40,
      rows: 10,
      capabilities: { glyphProtocol: false, graphicsProtocol: "kitty" },
    });

    expectHomeGlyph(cellAt);
    expect(driver.writtenData).toContain("\x1b_Gf=100,a=T,t=d,s=16,v=16,c=2,r=1;");
    expect(driver.writtenData).toContain("\x1b\\");
  });

  test("Renders iTerm2 inline graphics when supported", async () => {
    iconRegistry.registerIcon({ name: "test-home", svg: mockSvg, textFallback: "🏠" });
    const { driver, cellAt } = await mountApp(<Icon name="test-home" style={{ color: "blue" }} />, {
      cols: 40,
      rows: 10,
      capabilities: { glyphProtocol: false, graphicsProtocol: "iterm2" },
    });

    expectHomeGlyph(cellAt);
    expect(driver.writtenData).toContain("\x1b]1337;File=inline=1;width=2;height=1:");
    expect(driver.writtenData).toContain("\x07");
  });

  test("Renders dynamically colored Sixel graphics when supported", async () => {
    iconRegistry.registerIcon({ name: "test-home", svg: mockSvg, textFallback: "🏠" });
    const { driver, cellAt } = await mountApp(
      <Icon name="test-home" style={{ color: "#ff0000" }} />,
      { cols: 40, rows: 10, capabilities: { glyphProtocol: false, graphicsProtocol: "sixel" } },
    );

    expectHomeGlyph(cellAt);
    expect(driver.writtenData).toContain("\x1bPq");
    expect(driver.writtenData).toContain("#15;2;100;0;0");
    expect(driver.writtenData).toContain("\x1b\\");
  });

  test("Falls back to unicode text when no graphics protocol is supported", async () => {
    iconRegistry.registerIcon({ name: "test-home", svg: mockSvg, textFallback: "🏠" });
    const { driver, cellAt } = await mountApp(
      <Icon name="test-home" style={{ color: "green" }} />,
      { cols: 40, rows: 10, capabilities: { glyphProtocol: false, graphicsProtocol: "none" } },
    );

    // 🏠 is wide (width 2)
    expect(cellAt(0, 0).char).toBe("🏠");
    expect(cellAt(1, 0).wideContinuation).toBe(true);
    expect(driver.writtenData).toContain("🏠");
  });

  test("Resolves and registers Heroicons dynamically via HeroIcon component", async () => {
    const { driver } = await mountApp(
      <HeroIcon name="beaker" variant="solid" style={{ color: "yellow" }} />,
      { cols: 40, rows: 10, capabilities: { glyphProtocol: false, graphicsProtocol: "sixel" } },
    );

    const icon = iconRegistry.get("hero:solid:beaker");
    expect(icon).toBeDefined();
    expect(icon?.textFallback).toBe("🧪");
    expect(icon?.svg).toContain('viewBox="0 0 24 24"');
    expect(driver.writtenData).toContain("\x1bPq");
  });

  test("Supports other HeroIcon variants (outline, mini, micro)", async () => {
    await mountApp(
      <VBox>
        <HeroIcon name="heart" variant="outline" />
        <HeroIcon name="bell" variant="mini" />
        <HeroIcon name="home" variant="micro" />
      </VBox>,
      { cols: 40, rows: 10, capabilities: { glyphProtocol: false, graphicsProtocol: "none" } },
    );

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
