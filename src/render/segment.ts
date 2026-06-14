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

export function splitGraphemes(str: string): string[] {
  if (str === "") return [];
  if (_segmenter) {
    const out: string[] = [];
    for (const { segment } of _segmenter.segment(str)) out.push(segment);
    return out;
  }
  return [...str];
}

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

  // Custom SVG icon PUA characters span 2 columns
  if (code >= 0xe000 && code <= 0xefff) return 2;

  return stringWidthLib(char);
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
