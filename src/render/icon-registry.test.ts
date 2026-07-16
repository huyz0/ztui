import { afterEach, describe, expect, it, vi } from "vitest";
import * as sharpSync from "../utils/sharp-sync.ts";
import { IconRegistry, parseColorToRGB, rasterizeSVG } from "./icon-registry.ts";

describe("IconRegistry", () => {
  it("registers, replaces, and assigns stable codepoints", () => {
    const reg = new IconRegistry();
    reg.registerIcon({ name: "a", svg: "<svg/>", textFallback: "?" });
    const cp1 = reg.getCodepoint("a");
    expect(cp1).toBeDefined();
    expect(reg.get("a")?.svg).toBe("<svg/>");

    // Re-registering the same name keeps its codepoint but replaces the definition.
    reg.registerIcon({ name: "a", svg: "<svg id='2'/>", textFallback: "!" });
    expect(reg.getCodepoint("a")).toBe(cp1);
    expect(reg.get("a")?.svg).toBe("<svg id='2'/>");
  });

  it("registerIcons registers a batch and getAll lists everything", () => {
    const reg = new IconRegistry();
    reg.registerIcons([
      { name: "b", svg: "<svg/>", textFallback: "b" },
      { name: "c", svg: "<svg/>", textFallback: "c" },
    ]);
    expect(
      reg
        .getAll()
        .map((i) => i.name)
        .sort(),
    ).toEqual(["b", "c"]);
    expect(reg.getCodepoint("b")).not.toBe(reg.getCodepoint("c"));
  });

  it("get/getCodepoint return undefined for unknown names", () => {
    const reg = new IconRegistry();
    expect(reg.get("nope")).toBeUndefined();
    expect(reg.getCodepoint("nope")).toBeUndefined();
  });
});

describe("parseColorToRGB", () => {
  it("resolves ANSI colour names", () => {
    expect(parseColorToRGB("red")).toEqual({ r: 128, g: 0, b: 0 });
    expect(parseColorToRGB("Bright-Blue")).toEqual({ r: 0, g: 0, b: 255 });
  });

  it("resolves #rgb and #rrggbb hex", () => {
    expect(parseColorToRGB("#0a4")).toEqual({ r: 0, g: 170, b: 68 });
    expect(parseColorToRGB("#0a1428")).toEqual({ r: 10, g: 20, b: 40 });
  });

  it("resolves rgb(...) strings", () => {
    expect(parseColorToRGB("rgb(1, 2, 3)")).toEqual({ r: 1, g: 2, b: 3 });
  });

  it("falls back to white for unrecognised input", () => {
    expect(parseColorToRGB("not-a-color")).toEqual({ r: 255, g: 255, b: 255 });
    // A hex string of the wrong length also falls through to the fallback.
    expect(parseColorToRGB("#12345")).toEqual({ r: 255, g: 255, b: 255 });
  });
});

describe("rasterizeSVG", () => {
  afterEach(() => vi.restoreAllMocks());

  it("strips explicit width/height from the <svg> opening tag before wrapping", () => {
    const spy = vi.spyOn(sharpSync, "renderSvgSync").mockReturnValue({
      pngBase64: "",
      pixels: new Uint8Array(),
      width: 16,
      height: 16,
    });
    rasterizeSVG('<svg width="24" height="24" viewBox="0 0 24 24"><path/></svg>');
    const wrapped = spy.mock.calls[0][0].svg;
    // The inner (cleaned) svg must not carry the original width/height anymore.
    expect(wrapped).not.toMatch(/<svg width="24" height="24"/);
    expect(wrapped).toContain("<path/>");
  });

  it("passes svg through unchanged when it has no <svg ...> opening tag to clean", () => {
    const spy = vi.spyOn(sharpSync, "renderSvgSync").mockReturnValue({
      pngBase64: "",
      pixels: new Uint8Array(),
      width: 16,
      height: 16,
    });
    rasterizeSVG("<path/>");
    const wrapped = spy.mock.calls[0][0].svg;
    expect(wrapped).toContain("<path/>");
  });
});
