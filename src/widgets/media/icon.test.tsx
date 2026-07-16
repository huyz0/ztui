import { describe, expect, test } from "vitest";
import { iconRegistry } from "../../core.ts";
import { HeroIcon, Icon, VBox } from "../../react.ts";
import { registerHeroIcon, resolveHeroIcon } from "../../render/heroicons.ts";
import { parseColorToRGB } from "../../render/icon-registry.ts";
import { mountApp } from "../../test/harness.tsx";

describe("resolveHeroIcon variants", () => {
  test("each variant resolves to a real SVG from a different size/style dir", () => {
    for (const variant of ["solid", "outline", "mini", "micro"] as const) {
      const svg = resolveHeroIcon("home", variant);
      expect(svg).toContain("<svg");
    }
  });

  test("a non-existent icon throws", () => {
    expect(() => resolveHeroIcon("definitely-not-a-heroicon")).toThrow();
  });

  test("registerHeroIcon registers under a hero: key and is idempotent", () => {
    const name = registerHeroIcon("home", "outline");
    expect(name).toBe("hero:outline:home");
    expect(iconRegistry.get(name)?.svg).toContain("<svg");
    expect(registerHeroIcon("home", "outline")).toBe(name); // no throw, cached
  });
});

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

describe("IconWidget", () => {
  test("visibility toggling and border size limits render without error", async () => {
    const { app, settle } = await mountApp(
      <VBox>
        <Icon name="home" style={{ width: 1 }} />
        <Icon name="home" id="icon-to-hide" />
        <Icon name="home" /> {/* default styling resolved background */}
      </VBox>,
      { cols: 80, rows: 25, capabilities: { glyphProtocol: false, graphicsProtocol: "none" } },
    );

    const vbox = app.activeScreen.children[0];
    const iconToHide = vbox.children[1] as any;
    iconToHide.visible = false;
    app.queueRender();
    await settle();

    expect(app.buffer).toBeDefined();
  });
});
