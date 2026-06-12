/**
 * Pure text-selection helpers shared by editable widgets (`Input`, `TextArea`)
 * and, later, read-only text widgets. No DOM/driver imports so the range math
 * stays trivially unit-testable.
 *
 * Two coordinate models:
 *   - **Linear** (`Input`): a caret is an integer index into the grapheme array.
 *   - **2D** (`TextArea`): a caret is a `{ row, col }` position into a `string[]`
 *     of lines, where `col` indexes into that line's grapheme array.
 *
 * All slicing splits on grapheme clusters (`splitGraphemes`) so ZWJ emoji,
 * combining marks, and astral characters count as a single column, matching the
 * rest of the widget code.
 */

import { splitGraphemes } from "../../render/segment.ts";

// ── Linear (1D) ──────────────────────────────────────────────────────────────

/** Order an (anchor, caret) pair into `[start, end)` with `start <= end`. */
export function normalizeRange(anchor: number, caret: number): [number, number] {
  return anchor <= caret ? [anchor, caret] : [caret, anchor];
}

/** Substring of `chars` over the half-open `[start, end)` index range. */
export function extractLinear(chars: string[], start: number, end: number): string {
  return chars.slice(start, end).join("");
}

// ── 2D ───────────────────────────────────────────────────────────────────────

export interface Pos {
  row: number;
  col: number;
}

/** `< 0` if `a` precedes `b`, `0` if equal, `> 0` if `a` follows `b`. */
export function comparePos(a: Pos, b: Pos): number {
  if (a.row !== b.row) return a.row - b.row;
  return a.col - b.col;
}

/** Order an (anchor, caret) pair so the first element is the earlier position. */
export function orderPair(anchor: Pos, caret: Pos): [Pos, Pos] {
  return comparePos(anchor, caret) <= 0 ? [anchor, caret] : [caret, anchor];
}

/**
 * Selected text between two ordered positions. Multi-line spans are joined with
 * `\n`; a same-row span is a simple slice.
 */
export function extractSelection(lines: string[], start: Pos, end: Pos): string {
  if (start.row === end.row) {
    return splitGraphemes(lines[start.row]).slice(start.col, end.col).join("");
  }
  const parts: string[] = [];
  parts.push(splitGraphemes(lines[start.row]).slice(start.col).join(""));
  for (let r = start.row + 1; r < end.row; r++) parts.push(lines[r]);
  parts.push(splitGraphemes(lines[end.row]).slice(0, end.col).join(""));
  return parts.join("\n");
}

/**
 * Return a new `lines` array with the `[start, end)` span removed. The two
 * partial boundary lines are merged. The caret after a delete is always at
 * `start` (caller's responsibility to set it).
 */
export function deleteRange(lines: string[], start: Pos, end: Pos): string[] {
  const result = lines.slice();
  if (start.row === end.row) {
    const chars = splitGraphemes(result[start.row]);
    chars.splice(start.col, end.col - start.col);
    result[start.row] = chars.join("");
    return result;
  }
  const head = splitGraphemes(result[start.row]).slice(0, start.col).join("");
  const tail = splitGraphemes(result[end.row]).slice(end.col).join("");
  result.splice(start.row, end.row - start.row + 1, head + tail);
  return result;
}

/**
 * Insert `text` (possibly multi-line) at `pos`, returning the new `lines` array
 * and the caret position at the end of the inserted text.
 */
export function insertAt(lines: string[], pos: Pos, text: string): { lines: string[]; caret: Pos } {
  // Accept every newline flavour: native terminal paste (bracketed paste) often
  // delivers line breaks as a lone `\r`, while `\r\n` / `\n` come from files and
  // OSC 52. Splitting on all three keeps a multi-line paste multi-line.
  const segments = text.split(/\r\n|\r|\n/);
  const target = splitGraphemes(lines[pos.row]);
  const before = target.slice(0, pos.col).join("");
  const after = target.slice(pos.col).join("");
  const result = lines.slice();

  if (segments.length === 1) {
    result[pos.row] = before + segments[0] + after;
    return {
      lines: result,
      caret: { row: pos.row, col: pos.col + splitGraphemes(segments[0]).length },
    };
  }

  const last = segments[segments.length - 1];
  const block = [before + segments[0], ...segments.slice(1, -1), last + after];
  result.splice(pos.row, 1, ...block);
  return {
    lines: result,
    caret: { row: pos.row + segments.length - 1, col: splitGraphemes(last).length },
  };
}
