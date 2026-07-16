import type { Style } from "./style.ts";

/** An inline image/SVG attached to a cell, rendered per the backend's graphics protocol. */
export interface GraphicMetadata {
  /** Discriminant — currently always `"image"`. */
  type: "image";
  /**
   * Rasterized RGBA pixels for the terminal graphics protocols. Absent for a
   * vector graphic that the web/canvas backend rasterizes natively from {@link svg}.
   */
  pixelBuffer?: Uint8Array;
  /** Pixel width of the rasterized buffer. */
  pixelWidth?: number;
  /** Pixel height of the rasterized buffer. */
  pixelHeight?: number;
  /** Width of the image in cells. */
  cellWidth: number;
  /** Height of the image in cells. */
  cellHeight: number;
  /** Base64 PNG, used by protocols/backends that accept encoded images. */
  pngBase64?: string;
  /**
   * Raw SVG markup for native vector rendering on the canvas backend (`$theme`
   * tokens already resolved). When set, the canvas draws this directly — crisp at
   * the device pixel ratio — and the terminal pixel fields can be omitted.
   */
  svg?: string;
  /** Stacking order against other graphics. */
  zIndex?: number;
}

/**
 * Value-equality for two cell graphics. The widget layer rebuilds the
 * {@link GraphicMetadata} object every render even when the picture is identical
 * (the heavy `pngBase64`/pixel data is cached and reused), so a reference check
 * would report a change on every frame and needlessly delete + re-transmit the
 * image — which can drop it on a terminal's stateful graphics layer. Comparing by
 * value lets an unchanged image be left in place across full frames (e.g. while
 * scrolling an unrelated panel).
 */
export function graphicsEqual(a?: GraphicMetadata, b?: GraphicMetadata): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.pngBase64 === b.pngBase64 &&
    a.cellWidth === b.cellWidth &&
    a.cellHeight === b.cellHeight &&
    a.pixelWidth === b.pixelWidth &&
    a.pixelHeight === b.pixelHeight &&
    a.zIndex === b.zIndex &&
    a.svg === b.svg
  );
}

/** One grid cell: its glyph, style, and optional icon/graphic. */
export interface Cell {
  /** The character (may be a multi-code-point grapheme). */
  char: string;
  /** Visual style. */
  style: Style;
  /** True for the trailing half of a wide (2-cell) glyph. */
  wideContinuation: boolean;
  /** Registered icon name drawn in this cell, if any. */
  icon?: string;
  /** Inline graphic anchored at this cell, if any. */
  graphic?: GraphicMetadata;
}

/**
 * Whether a per-cell graphics-erase must be emitted before drawing this cell:
 * the previous frame held an icon/graphic here that is now different or gone.
 *
 * A cell that continues a *current* image ({@link Cell.wideContinuation}) is
 * never cleared — its lead cell's image already spans this footprint, and the
 * erase paints an opaque rectangle that (on sixel, which has no global delete)
 * punches a black hole into the freshly-drawn image. `renderDiff` separately
 * handles the case where this cell is a continuation of an unrelated (plain)
 * wide glyph instead — see the comment there.
 */
export function needsGraphicClear(cell: Cell, oldCell?: Cell): boolean {
  const oldHadImage = !!(oldCell && (oldCell.icon || oldCell.graphic));
  if (!oldHadImage || cell.wideContinuation) return false;
  return oldCell.icon !== cell.icon || !graphicsEqual(oldCell.graphic, cell.graphic);
}
