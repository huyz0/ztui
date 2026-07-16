import { afterEach, describe, expect, it, vi } from "vitest";
import * as graphicsModule from "../driver/bun/graphics.ts";
import * as iconRegistryModule from "../render/icon-registry.ts";
import { iconRegistry } from "../render/icon-registry.ts";
import { VTEDriver } from "./vte-runner.ts";

const SVG = '<svg viewBox="0 0 24 24"><rect width="24" height="24" fill="currentColor"/></svg>';
iconRegistry.registerIcon({ name: "vte-test-icon", svg: SVG, textFallback: "?" });

describe("VTEDriver.getIconSequence", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns an empty string for an unregistered icon name", () => {
    const t = new VTEDriver();
    expect(t.getIconSequence("no-such-icon")).toBe("");
  });

  it("kitty protocol: falls back to raster width/height when super* is undefined", () => {
    vi.spyOn(iconRegistryModule, "rasterizeSVG").mockReturnValue({
      pngBase64: "AA==",
      pixels: new Uint8Array(),
      width: 12,
      height: 24,
      superWidth: undefined as unknown as number,
      superHeight: undefined as unknown as number,
    });
    const t = new VTEDriver(80, 24, { graphicsProtocol: "kitty" });
    const seq = t.getIconSequence("vte-test-icon");
    expect(seq).toContain("s=12");
    expect(seq).toContain("v=24");
  });

  it("kitty protocol: cellSize falls back to 8x16 when not provided", () => {
    const spy = vi.spyOn(iconRegistryModule, "rasterizeSVG").mockReturnValue({
      pngBase64: "",
      pixels: new Uint8Array(),
      width: 1,
      height: 1,
      superWidth: 1,
      superHeight: 1,
    });
    const t = new VTEDriver(80, 24, { graphicsProtocol: "kitty", cellSize: undefined });
    t.getIconSequence("vte-test-icon");
    // cellWidth * 2 = 16, cellHeight = 16 when cellSize is absent.
    expect(spy).toHaveBeenCalledWith(expect.any(String), 16, 16, "white");
  });

  it("iterm2 protocol returns an iTerm2 inline-image escape", () => {
    vi.spyOn(iconRegistryModule, "rasterizeSVG").mockReturnValue({
      pngBase64: "BB==",
      pixels: new Uint8Array(),
      width: 1,
      height: 1,
      superWidth: 1,
      superHeight: 1,
    });
    const t = new VTEDriver(80, 24, { graphicsProtocol: "iterm2" });
    expect(t.getIconSequence("vte-test-icon")).toContain("1337;File=inline=1");
  });

  it("sixel protocol defaults bgColor to the theme background when not given", () => {
    vi.spyOn(iconRegistryModule, "rasterizeSVG").mockReturnValue({
      pngBase64: "",
      pixels: new Uint8Array([1, 2, 3, 4]),
      width: 1,
      height: 1,
      superWidth: 1,
      superHeight: 1,
    });
    const sixelSpy = vi.spyOn(graphicsModule, "rgbaToSixel").mockReturnValue("SIXELDATA");
    const t = new VTEDriver(80, 24, { graphicsProtocol: "sixel" });
    const seq = t.getIconSequence("vte-test-icon", "red");
    expect(seq).toContain("SIXELDATA");
    expect(sixelSpy).toHaveBeenCalledWith(expect.anything(), 1, 1, "red", "#1e1e2e");
  });

  it("sixel protocol caches the rendered sixel string per fg/bg pair", () => {
    vi.spyOn(iconRegistryModule, "rasterizeSVG").mockReturnValue({
      pngBase64: "",
      pixels: new Uint8Array([1, 2, 3, 4]),
      width: 1,
      height: 1,
      superWidth: 1,
      superHeight: 1,
    });
    const sixelSpy = vi.spyOn(graphicsModule, "rgbaToSixel").mockReturnValue("CACHED");
    const t = new VTEDriver(80, 24, { graphicsProtocol: "sixel" });
    t.getIconSequence("vte-test-icon", "blue", "#000000");
    t.getIconSequence("vte-test-icon", "blue", "#000000");
    expect(sixelSpy).toHaveBeenCalledTimes(1);
  });

  it("glyph protocol returns the private-use codepoint when registered", () => {
    const t = new VTEDriver(80, 24, { glyphProtocol: true, graphicsProtocol: undefined });
    const seq = t.getIconSequence("vte-test-icon");
    expect(seq.codePointAt(0)).toBe(iconRegistry.getCodepoint("vte-test-icon"));
  });

  it("glyph protocol falls back to the text fallback when no codepoint is registered", () => {
    // registerIcon always assigns a codepoint, so simulate the "not registered"
    // case directly through the registry lookup instead.
    const spy = vi.spyOn(iconRegistry, "getCodepoint").mockReturnValue(undefined);
    const t = new VTEDriver(80, 24, { glyphProtocol: true, graphicsProtocol: undefined });
    expect(t.getIconSequence("vte-test-icon")).toBe("?");
    spy.mockRestore();
  });

  it("falls back to the plain text glyph when no graphics/glyph protocol is available", () => {
    const t = new VTEDriver(80, 24, { graphicsProtocol: undefined, glyphProtocol: false });
    expect(t.getIconSequence("vte-test-icon")).toBe("?");
  });
});
