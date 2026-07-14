import { describe, expect, test, vi } from "vitest";
import * as iconRegistryModule from "../../render/icon-registry.ts";
import { iconRegistry } from "../../render/icon-registry.ts";
import type { TerminalCapabilities } from "../driver.ts";
import { TerminalGraphicsManager } from "./graphics.ts";

const SVG = '<svg viewBox="0 0 24 24"><rect width="24" height="24" fill="currentColor"/></svg>';

iconRegistry.registerIcon({ name: "test-cache-icon", svg: SVG, textFallback: "?" });

// rasterizeSVG does real image work (expensive); stub it so the cache-growth
// loop below stays fast and this test isn't a timing-flake risk.
vi.spyOn(iconRegistryModule, "rasterizeSVG").mockImplementation(
  () =>
    ({
      pngBase64: "",
      pixels: new Uint8Array(0),
      width: 1,
      height: 1,
      superWidth: 1,
      superHeight: 1,
    }) as iconRegistryModule.RasterizedIcon,
);

function caps(): TerminalCapabilities {
  return {
    graphicsProtocol: "kitty",
    glyphProtocol: false,
    cellSize: { width: 10, height: 20 },
  } as TerminalCapabilities;
}

describe("TerminalGraphicsManager icon cache", () => {
  test("evicts the oldest entry once the cache exceeds its cap, instead of growing unbounded", () => {
    // Regression: iconCache was a plain Map keyed by `${name}_${color}` with
    // no eviction. An icon rasterized under a color that changes every frame
    // (an animated fg color) grew the cache by one permanent entry per
    // distinct color for the life of the process.
    const mgr = new TerminalGraphicsManager();
    const capabilities = caps();
    const iterations = 264; // a handful past the 256 cap
    for (let i = 0; i < iterations; i++) {
      mgr.getIconSequence("test-cache-icon", capabilities, `#${i.toString().padStart(6, "0")}`);
    }
    expect(mgr._iconCacheSizeForTest()).toBeLessThanOrEqual(256);
  });
});
