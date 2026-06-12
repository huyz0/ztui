import { describe, expect, it } from "vitest";
import { mix, parseColor, parseRgb } from "./color.ts";

describe("parseColor", () => {
  it("parses rgba() with its alpha", () => {
    expect(parseColor("rgba(10, 20, 30, 0.5)")).toEqual({
      rgb: { r: 10, g: 20, b: 30 },
      alpha: 0.5,
    });
  });

  it("clamps out-of-range alpha", () => {
    expect(parseColor("rgba(0,0,0,2)")?.alpha).toBe(1);
    expect(parseColor("rgba(0,0,0,-1)")?.alpha).toBe(0);
  });

  it("parses 8-digit hex alpha", () => {
    const c = parseColor("#ff000080");
    expect(c?.rgb).toEqual({ r: 255, g: 0, b: 0 });
    expect(c?.alpha).toBeCloseTo(0x80 / 255, 5);
  });

  it("treats opaque colours (hex, rgb, named) as alpha 1", () => {
    expect(parseColor("#0a141e")).toEqual({ rgb: { r: 10, g: 20, b: 30 }, alpha: 1 });
    expect(parseColor("rgb(1,2,3)")).toEqual({ rgb: { r: 1, g: 2, b: 3 }, alpha: 1 });
    expect(parseColor("black")).toEqual({ rgb: { r: 0, g: 0, b: 0 }, alpha: 1 });
  });

  it("returns null for default / transparent / unknown", () => {
    expect(parseColor("default")).toBeNull();
    expect(parseColor("transparent")).toBeNull();
    expect(parseColor("not-a-color")).toBeNull();
  });

  it("stays consistent with parseRgb for plain rgb", () => {
    expect(parseColor("#0a141e")?.rgb).toEqual(parseRgb("#0a141e"));
  });
});

describe("mix", () => {
  it("interpolates and rounds channels", () => {
    expect(mix({ r: 0, g: 0, b: 0 }, { r: 100, g: 200, b: 50 }, 0.5)).toEqual({
      r: 50,
      g: 100,
      b: 25,
    });
    expect(mix({ r: 10, g: 10, b: 10 }, { r: 20, g: 20, b: 20 }, 0)).toEqual({
      r: 10,
      g: 10,
      b: 10,
    });
  });
});
