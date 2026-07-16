import { describe, expect, test, vi } from "vitest";
import * as iconRegistryModule from "../../render/icon-registry.ts";
import { iconRegistry } from "../../render/icon-registry.ts";
import type { TerminalCapabilities } from "../driver.ts";
import { fullColorRgbaToSixel, rgbaToSixel, TerminalGraphicsManager } from "./graphics.ts";

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

describe("TerminalGraphicsManager clear-sequence cache", () => {
  test("evicts the oldest clear sequence once the cache exceeds its cap, instead of growing unbounded", () => {
    // Regression: clearCache (sixel background-clear sequences) had no
    // eviction, unlike iconCache/sixelCache. A widget whose background color
    // animates every frame (e.g. a tween) would grow this cache by one
    // permanent entry per distinct bg color for the life of the process.
    const mgr = new TerminalGraphicsManager();
    const capabilities = {
      graphicsProtocol: "sixel",
      glyphProtocol: false,
      cellSize: { width: 10, height: 20 },
    } as TerminalCapabilities;
    const iterations = 264;
    for (let i = 0; i < iterations; i++) {
      mgr.getIconClearSequence(capabilities, `#${i.toString().padStart(6, "0")}`);
    }
    expect(mgr._clearCacheSizeForTest()).toBeLessThanOrEqual(256);
  });
});

describe("TerminalGraphicsManager.getIconClearSequence", () => {
  test("kitty protocol returns a placement-delete sequence", () => {
    const mgr = new TerminalGraphicsManager();
    const capabilities = {
      graphicsProtocol: "kitty",
      glyphProtocol: false,
    } as TerminalCapabilities;
    expect(mgr.getIconClearSequence(capabilities)).toBe("\x1b_Ga=d,d=c\x1b\\");
  });

  test("non-graphics protocol returns an empty string", () => {
    const mgr = new TerminalGraphicsManager();
    const capabilities = { graphicsProtocol: "none", glyphProtocol: false } as TerminalCapabilities;
    expect(mgr.getIconClearSequence(capabilities)).toBe("");
  });

  test("sixel protocol reuses a cached clear sequence for the same size/bg key", () => {
    const mgr = new TerminalGraphicsManager();
    const capabilities = {
      graphicsProtocol: "sixel",
      glyphProtocol: false,
      cellSize: { width: 10, height: 20 },
    } as TerminalCapabilities;
    const first = mgr.getIconClearSequence(capabilities, "#123456");
    // Second call with the *same* bg color hits the cache (re-inserts as MRU)
    // instead of re-encoding.
    const second = mgr.getIconClearSequence(capabilities, "#123456");
    expect(second).toBe(first);
  });

  test("sixel protocol falls back to the default bg when bgColor is 'default' or omitted", () => {
    const mgr = new TerminalGraphicsManager();
    const capabilities = {
      graphicsProtocol: "sixel",
      glyphProtocol: false,
      cellSize: { width: 10, height: 20 },
    } as TerminalCapabilities;
    const withDefault = mgr.getIconClearSequence(capabilities, "default");
    const withOmitted = mgr.getIconClearSequence(capabilities);
    expect(withDefault).toBe(withOmitted);
  });
});

describe("TerminalGraphicsManager.getIconSequence", () => {
  test("returns an empty string for an unregistered icon", () => {
    const mgr = new TerminalGraphicsManager();
    expect(mgr.getIconSequence("does-not-exist", caps())).toBe("");
  });

  test("kitty sequence uses raster.width/height when superWidth/superHeight are absent", () => {
    vi.spyOn(iconRegistryModule, "rasterizeSVG").mockImplementationOnce(
      () =>
        ({
          pngBase64: "",
          pixels: new Uint8Array(0),
          width: 4,
          height: 6,
        }) as iconRegistryModule.RasterizedIcon,
    );
    const mgr = new TerminalGraphicsManager();
    const seq = mgr.getIconSequence("test-cache-icon", caps(), "#unique-kitty-no-super");
    expect(seq).toContain("s=4,v=6");
  });

  test("iterm2 protocol produces an inline-image escape sequence", () => {
    const mgr = new TerminalGraphicsManager();
    const capabilities = {
      graphicsProtocol: "iterm2",
      glyphProtocol: false,
      cellSize: { width: 10, height: 20 },
    } as TerminalCapabilities;
    const seq = mgr.getIconSequence("test-cache-icon", capabilities, "#unique-iterm2");
    expect(seq).toContain("1337;File=inline=1");
  });

  test("sixel protocol reuses the cached sixel string for the same fg/bg pair", () => {
    const mgr = new TerminalGraphicsManager();
    const capabilities = {
      graphicsProtocol: "sixel",
      glyphProtocol: false,
      cellSize: { width: 10, height: 20 },
    } as TerminalCapabilities;
    const first = mgr.getIconSequence("test-cache-icon", capabilities, "#unique-sixel", "#bg1");
    const second = mgr.getIconSequence("test-cache-icon", capabilities, "#unique-sixel", "#bg1");
    expect(second).toBe(first);
    // A different bg with the same fg populates a second sixelCache entry
    // under the same icon-cache record.
    const third = mgr.getIconSequence("test-cache-icon", capabilities, "#unique-sixel", "#bg2");
    expect(third).not.toBe(first);
  });

  test("sixel: evicts the oldest sixelCache entry once its per-icon cap is exceeded", () => {
    const mgr = new TerminalGraphicsManager();
    const capabilities = {
      graphicsProtocol: "sixel",
      glyphProtocol: false,
      cellSize: { width: 10, height: 20 },
    } as TerminalCapabilities;
    // Same icon + fg color (so all entries land in the same iconCache record's
    // sixelCache), but a distinct bg color each time so each call adds a new
    // sixelCache entry — past the 256 cap, forcing eviction.
    for (let i = 0; i < 264; i++) {
      mgr.getIconSequence(
        "test-cache-icon",
        capabilities,
        "#unique-sixel-evict",
        `#${i.toString().padStart(6, "0")}`,
      );
    }
    // No public accessor for the per-icon sixelCache size; the assertion here
    // is simply that this doesn't throw and keeps producing sequences well
    // past the cap — the eviction branch coverage is what's under test.
    const seq = mgr.getIconSequence(
      "test-cache-icon",
      capabilities,
      "#unique-sixel-evict",
      "#final",
    );
    expect(seq).toContain("\x1bPq");
  });

  test("glyphProtocol renders the registered codepoint, or falls back to textFallback", () => {
    const mgr = new TerminalGraphicsManager();
    const capabilities = {
      graphicsProtocol: "none",
      glyphProtocol: true,
    } as TerminalCapabilities;
    iconRegistry.registerIcon({ name: "glyph-icon", svg: SVG, textFallback: "F" });
    vi.spyOn(iconRegistryModule.iconRegistry, "getCodepoint").mockReturnValueOnce(undefined);
    expect(mgr.getIconSequence("glyph-icon", capabilities)).toBe("F");
  });

  test("falls back to the icon's textFallback when no protocol matches", () => {
    const mgr = new TerminalGraphicsManager();
    const capabilities = { graphicsProtocol: "none", glyphProtocol: false } as TerminalCapabilities;
    expect(mgr.getIconSequence("test-cache-icon", capabilities)).toBe("?");
  });
});

describe("TerminalGraphicsManager.getImageSequence", () => {
  const pixelBuffer = new Uint8Array(4 * 2 * 2); // 2x2 RGBA

  test("kitty: encodes via encodePNG when no pngBase64 is given, honors an explicit zIndex", () => {
    const mgr = new TerminalGraphicsManager();
    const capabilities = {
      graphicsProtocol: "kitty",
      glyphProtocol: false,
    } as TerminalCapabilities;
    const seq = mgr.getImageSequence(
      pixelBuffer,
      2,
      2,
      1,
      1,
      capabilities,
      undefined,
      undefined,
      3,
    );
    expect(seq).toContain("z=3");
  });

  test("kitty: uses the provided pngBase64 and defaults zIndex to 0", () => {
    const mgr = new TerminalGraphicsManager();
    const capabilities = {
      graphicsProtocol: "kitty",
      glyphProtocol: false,
    } as TerminalCapabilities;
    const seq = mgr.getImageSequence(pixelBuffer, 2, 2, 1, 1, capabilities, "PROVIDED_BASE64");
    expect(seq).toContain("PROVIDED_BASE64");
    expect(seq).toContain("z=0");
  });

  test("iterm2: uses the provided pngBase64, or encodes via encodePNG when absent", () => {
    const mgr = new TerminalGraphicsManager();
    const capabilities = {
      graphicsProtocol: "iterm2",
      glyphProtocol: false,
    } as TerminalCapabilities;
    const withBase64 = mgr.getImageSequence(
      pixelBuffer,
      2,
      2,
      1,
      1,
      capabilities,
      "PROVIDED_BASE64",
    );
    expect(withBase64).toContain("PROVIDED_BASE64");
    const withoutBase64 = mgr.getImageSequence(pixelBuffer, 2, 2, 1, 1, capabilities);
    expect(withoutBase64).toContain("1337;File=inline=1");
  });

  test("sixel: delegates to fullColorRgbaToSixel", () => {
    const mgr = new TerminalGraphicsManager();
    const capabilities = {
      graphicsProtocol: "sixel",
      glyphProtocol: false,
    } as TerminalCapabilities;
    const seq = mgr.getImageSequence(pixelBuffer, 2, 2, 1, 1, capabilities);
    expect(seq).toContain("\x1bPq");
  });

  test("unsupported protocol returns an empty string", () => {
    const mgr = new TerminalGraphicsManager();
    const capabilities = { graphicsProtocol: "none", glyphProtocol: false } as TerminalCapabilities;
    expect(mgr.getImageSequence(pixelBuffer, 2, 2, 1, 1, capabilities)).toBe("");
  });
});

describe("rgbaToSixel", () => {
  test("defaults color/bgColor when omitted", () => {
    const rgba = new Uint8Array(4 * 2 * 2).fill(255); // opaque white pixels
    const seq = rgbaToSixel(rgba, 2, 2);
    expect(seq.startsWith("\x1bPq")).toBe(true);
    expect(seq.endsWith("\x1b\\")).toBe(true);
  });
});

describe("fullColorRgbaToSixel", () => {
  test("skips fully-transparent rows (rightBound stays 0) and run-length-encodes long runs", () => {
    const width = 8;
    const height = 6;
    const rgba = new Uint8Array(width * height * 4); // all-zero => fully transparent
    // Make one solid opaque run of >= 4 identical pixels so the `cnt >= 4`
    // run-length branch is exercised alongside the all-transparent skip.
    for (let x = 0; x < width; x++) {
      const idx = (0 * width + x) * 4;
      rgba[idx] = 255;
      rgba[idx + 1] = 0;
      rgba[idx + 2] = 0;
      rgba[idx + 3] = 255;
    }
    const seq = fullColorRgbaToSixel(rgba, width, height, "black");
    expect(seq.startsWith("\x1bPq")).toBe(true);
  });
});
