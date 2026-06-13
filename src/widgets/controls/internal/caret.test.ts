import { describe, expect, test } from "vitest";
import { blendCaretColors, SMOOTH_CARET_PERIOD, smoothCaretIntensity } from "./caret.ts";

describe("smoothCaretIntensity", () => {
  test("is fully lit at the start of the cycle and dark at the midpoint", () => {
    expect(smoothCaretIntensity(0)).toBeCloseTo(1, 5);
    expect(smoothCaretIntensity(SMOOTH_CARET_PERIOD / 2)).toBeCloseTo(0, 5);
    expect(smoothCaretIntensity(SMOOTH_CARET_PERIOD)).toBeCloseTo(1, 5);
  });

  test("stays within [0,1] across the cycle and wraps for large/negative input", () => {
    for (let i = 0; i <= 12; i++) {
      const v = smoothCaretIntensity((SMOOTH_CARET_PERIOD * i) / 12);
      expect(v).toBeGreaterThanOrEqual(-1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    }
    // Phase wraps, so t and t+period match; negatives are handled too.
    expect(smoothCaretIntensity(SMOOTH_CARET_PERIOD * 3.25)).toBeCloseTo(
      smoothCaretIntensity(SMOOTH_CARET_PERIOD * 0.25),
      5,
    );
    expect(smoothCaretIntensity(-SMOOTH_CARET_PERIOD / 2)).toBeCloseTo(0, 5);
  });
});

describe("blendCaretColors", () => {
  const focus = "#00ffff";
  const bg = "#000000";
  const fg = "#ffffff";

  test("block caret fades its glyph from the surface up to the focus colour", () => {
    expect(blendCaretColors(1, focus, bg, fg, true)).toEqual({
      color: "rgb(0, 255, 255)",
      background: "#000000",
    });
    expect(blendCaretColors(0, focus, bg, fg, true)).toEqual({
      color: "rgb(0, 0, 0)", // invisible against bg
      background: "#000000",
    });
  });

  test("over a character: glyph eases to a colour contrasting the lit caret", () => {
    // focus #00ffff is light (luminance > 0.5) → lit glyph eases toward black.
    expect(blendCaretColors(1, focus, bg, fg, false)).toEqual({
      color: "rgb(0, 0, 0)", // contrasts the cyan caret
      background: "rgb(0, 255, 255)",
    });
    // Caret dark → glyph restored to its original colour on the surface.
    expect(blendCaretColors(0, focus, bg, fg, false)).toEqual({
      color: "rgb(255, 255, 255)",
      background: "rgb(0, 0, 0)",
    });
  });

  test("over a character: dark caret colour picks a white contrast", () => {
    // focus #102040 is dark → lit glyph eases toward white instead.
    const lit = blendCaretColors(1, "#102040", bg, "#ff0000", false);
    expect(lit.color).toBe("rgb(255, 255, 255)");
  });

  test("clamps intensity and tolerates unparseable colours", () => {
    expect(blendCaretColors(2, focus, bg, fg, true).color).toBe("rgb(0, 255, 255)");
    // Bad focus colour falls back to the lit endpoint rather than blanking.
    expect(blendCaretColors(0.5, "nonsense", bg, fg, true).color).toBe("nonsense");
  });
});
