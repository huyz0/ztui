import { describe, expect, test } from "vitest";
import { type GraphicMetadata, graphicsEqual, ScreenBuffer } from "./buffer.ts";

function makeGraphic(overrides: Partial<GraphicMetadata> = {}): GraphicMetadata {
  return {
    type: "image",
    pixelBuffer: new Uint8Array(4),
    pixelWidth: 20,
    pixelHeight: 20,
    cellWidth: 2,
    cellHeight: 1,
    pngBase64: "AAAA",
    zIndex: 0,
    ...overrides,
  };
}

/**
 * The image widget rebuilds the `graphic` object every render even when the
 * picture is unchanged (heavy pixel/base64 data is cached and reused). A diff
 * keyed on object identity would delete + re-transmit the image every full frame
 * — and a scroll forces a full frame — which can drop the placement on the
 * terminal's stateful graphics layer (the "grey square" regression). The diff
 * must compare graphics by value so an unchanged image is left in place.
 */
describe("graphicsEqual: value comparison for cell graphics", () => {
  test("two distinct objects with identical content are equal", () => {
    expect(graphicsEqual(makeGraphic(), makeGraphic())).toBe(true);
  });

  test("undefined vs a graphic is not equal (appear/disappear)", () => {
    expect(graphicsEqual(undefined, makeGraphic())).toBe(false);
    expect(graphicsEqual(makeGraphic(), undefined)).toBe(false);
  });

  test("two undefined are equal", () => {
    expect(graphicsEqual(undefined, undefined)).toBe(true);
  });

  test("differing pixels, size, or z-index are not equal", () => {
    const base = makeGraphic();
    expect(graphicsEqual(base, makeGraphic({ pngBase64: "BBBB" }))).toBe(false);
    expect(graphicsEqual(base, makeGraphic({ cellWidth: 3 }))).toBe(false);
    expect(graphicsEqual(base, makeGraphic({ cellHeight: 2 }))).toBe(false);
    expect(graphicsEqual(base, makeGraphic({ pixelWidth: 40 }))).toBe(false);
    expect(graphicsEqual(base, makeGraphic({ pixelHeight: 40 }))).toBe(false);
    expect(graphicsEqual(base, makeGraphic({ zIndex: -1 }))).toBe(false);
    expect(graphicsEqual(base, makeGraphic({ svg: "<svg/>" }))).toBe(false);
  });
});

describe("renderDiff: an unchanged image is not re-emitted", () => {
  // formatChar marker mimicking the driver: a present graphic emits a placement.
  const fmt = (cell: { char: string; graphic?: GraphicMetadata }) =>
    cell.graphic ? "[IMG]" : cell.char;

  function bufferWithImage(): { buf: ScreenBuffer; prev: ScreenBuffer } {
    const buf = new ScreenBuffer(4, 2);
    const prev = new ScreenBuffer(4, 2);
    // Place a fresh graphic object into both buffers' (0,0) cell.
    buf.cells[0][0].graphic = makeGraphic();
    prev.cells[0][0].graphic = makeGraphic(); // distinct object, identical content
    return { buf, prev };
  }

  test("re-rendering the same image (new object, same content) emits nothing", () => {
    const { buf, prev } = bufferWithImage();
    const out = buf.renderDiff(prev, fmt);
    expect(out).not.toContain("[IMG]");
  });

  test("a moved image is re-emitted (both old and new cells diff)", () => {
    const buf = new ScreenBuffer(4, 2);
    const prev = new ScreenBuffer(4, 2);
    prev.cells[0][0].graphic = makeGraphic(); // was at (0,0)
    buf.cells[1][2].graphic = makeGraphic(); // now at (2,1)
    const out = buf.renderDiff(prev, fmt);
    // The new placement is emitted; the old cell, now blank, also diffs (cleared).
    expect(out).toContain("[IMG]");
  });

  test("changed image content is re-emitted", () => {
    const { buf, prev } = bufferWithImage();
    buf.cells[0][0].graphic = makeGraphic({ pngBase64: "CHANGED" });
    const out = buf.renderDiff(prev, fmt);
    expect(out).toContain("[IMG]");
  });

  test("an appearing image is emitted; a vanishing one is cleared", () => {
    // Appear: prev blank, new has image.
    const appearNew = new ScreenBuffer(4, 2);
    const appearPrev = new ScreenBuffer(4, 2);
    appearNew.cells[0][0].graphic = makeGraphic();
    expect(appearNew.renderDiff(appearPrev, fmt)).toContain("[IMG]");

    // Vanish: prev has image, new blank → the cell diffs (so a clear is emitted).
    const goneNew = new ScreenBuffer(4, 2);
    const gonePrev = new ScreenBuffer(4, 2);
    gonePrev.cells[0][0].graphic = makeGraphic();
    goneNew.cells[0][0].char = " ";
    // The (0,0) cell changed from image→blank, so the diff repositions/clears it.
    const out = goneNew.renderDiff(gonePrev, fmt);
    expect(out.length).toBeGreaterThan(0);
  });
});
