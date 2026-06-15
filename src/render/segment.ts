import stringWidthLib from "string-width";
import { Style } from "./style.ts";

/**
 * Splits a string into user-perceived characters (grapheme clusters) rather
 * than code points. ZWJ emoji (👨‍👩‍👧), flag pairs, skin-tone modifiers, and
 * combining marks each collapse to a single unit — so they occupy one cell,
 * advance the caret by one column, and select/delete atomically.
 *
 * `Intl.Segmenter` is the correct, Unicode-version-tracking implementation; the
 * `[...str]` (code-point) fallback only matters on ancient runtimes that lack
 * it. This is the canonical way to iterate display text in ztui — never iterate
 * a string by code point (`[...str]`, `for..of`) for column/caret math.
 */
const _segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

// Memoized grapheme splits for non-ASCII strings. Segmentation is pure, and
// non-ASCII content (box-drawing, CJK, animated block/braille glyphs) tends to
// recur frame-to-frame, so this turns a repeated `Intl.Segmenter` run into a Map
// hit. ASCII never enters the cache — its split is already a trivial fast path.
const graphemeCache = new Map<string, string[]>();
const GRAPHEME_CACHE_CAP = 4096;

export function splitGraphemes(str: string): string[] {
  if (str === "") return [];
  // Fast path: pure-ASCII text has no combining marks, surrogate pairs, or ZWJ
  // sequences, so every code unit is its own grapheme. `str.split("")` is far
  // cheaper than spinning up `Intl.Segmenter`, and text rendering/measuring runs
  // this on essentially every string every frame.
  if (isAscii(str)) return str.split("");

  // Return a fresh copy each call: the historical contract is a mutable array
  // (callers `splice` it), and a `slice` is still far cheaper than re-running the
  // segmenter on the same string.
  const cached = graphemeCache.get(str);
  if (cached) return cached.slice();
  let out: string[];
  if (_segmenter) {
    out = [];
    for (const { segment } of _segmenter.segment(str)) out.push(segment);
  } else {
    out = [...str];
  }
  if (graphemeCache.size >= GRAPHEME_CACHE_CAP) graphemeCache.clear();
  graphemeCache.set(str, out.slice());
  return out;
}

/** True when every code unit is printable/simple ASCII (≤ 0x7f). */
function isAscii(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 0x7f) return false;
  }
  return true;
}

// Memoized widths for non-ASCII graphemes. The expensive `string-width`
// measurement is pure (a glyph's cell width never changes), and the same few
// non-ASCII glyphs recur constantly — box-drawing for every border/table/
// scrollbar cell, plus repeated CJK/emoji in content — so caching turns a
// per-cell-per-frame library call into a Map hit. ASCII and PUA are handled by
// the arithmetic fast paths below and never enter the cache. The soft cap keeps
// an adversarial stream of distinct glyphs from growing the map without bound.
const widthCache = new Map<string, number>();
const WIDTH_CACHE_CAP = 8192;

/**
 * Cell width of a single grapheme cluster (0, 1, or 2). The control/PUA checks
 * look at the cluster's base code point; the visible width is measured across
 * the whole cluster so combining marks contribute 0 and ZWJ emoji stay 2.
 */
export function charWidth(char: string): number {
  const code = char.codePointAt(0);
  if (!code) return 0;
  // ASCII Control characters
  if (code < 32 || (code >= 127 && code < 160)) return 0;

  // Printable ASCII is always one column — skip the (comparatively expensive)
  // string-width measurement for the overwhelmingly common case. The arithmetic
  // is faster than a Map lookup, so ASCII deliberately bypasses the cache.
  if (code < 127) return 1;

  // Custom SVG icon PUA characters span 2 columns
  if (code >= 0xe000 && code <= 0xefff) return 2;

  const cached = widthCache.get(char);
  if (cached !== undefined) return cached;
  const w = stringWidthLib(char);
  if (widthCache.size >= WIDTH_CACHE_CAP) widthCache.clear();
  widthCache.set(char, w);
  return w;
}

export function stringWidth(str: string): number {
  let width = 0;
  for (const g of splitGraphemes(str)) {
    width += charWidth(g);
  }
  return width;
}

/**
 * C0/C1 control characters (including raw \n, \t, \r, ESC) must never be written
 * into a screen cell: when the buffer is flushed they would be emitted verbatim
 * to the terminal, moving the cursor and corrupting the whole layout.
 */
export function isControlChar(char: string): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  return code < 32 || (code >= 127 && code < 160);
}

/** A run of text sharing one {@link Style} — the unit drawn by {@link ScreenBuffer.drawSegment}. */
export class Segment {
  constructor(
    /** The run's text. */
    public readonly text: string,
    /** The run's style. */
    public readonly style: Style = Style.DEFAULT,
  ) {}

  /** Display width of the text in cells (grapheme-aware). */
  public get cellLength(): number {
    return stringWidth(this.text);
  }

  /** Crop to the cell range `[startCell, endCell)`, padding wide glyphs that straddle the edge with a space. */
  public crop(startCell: number, endCell: number): Segment {
    if (startCell <= 0 && endCell >= this.cellLength) {
      return this;
    }

    let currentCell = 0;
    let croppedText = "";

    for (const char of splitGraphemes(this.text)) {
      const w = charWidth(char);
      if (currentCell >= endCell) {
        break;
      }
      if (currentCell >= startCell) {
        if (currentCell + w <= endCell) {
          croppedText += char;
        } else {
          // If a wide character crosses the boundary, fill with a space to maintain alignment
          croppedText += " ";
        }
      } else if (currentCell + w > startCell) {
        // Wide character starts before startCell but extends into it
        croppedText += " ";
      }
      currentCell += w;
    }

    return new Segment(croppedText, this.style);
  }
}
