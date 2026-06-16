import { charWidth, splitGraphemes, stringWidth } from "./segment.ts";

/**
 * Plain-text, wide-char-aware line fitting shared by the widgets that lay out
 * their own text (Banner, DescriptionList, BarChart, …). For *styled* segment
 * wrapping see `rich-log`'s segment-based wrapper — this module deals in plain
 * strings only.
 */

/**
 * Greedy word-wrap of `text` to `width` display columns. Honours hard newlines,
 * drops the space at a wrap point, and hard-breaks a single word longer than the
 * line by grapheme. Returns `[]` for a non-positive width.
 */
export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [];
  const out: string[] = [];
  for (const hard of text.split("\n")) {
    if (hard === "") {
      out.push("");
      continue;
    }
    let line = "";
    let lineW = 0;
    for (const word of hard.split(/(\s+)/)) {
      if (word === "") continue;
      const ww = stringWidth(word);
      if (lineW > 0 && lineW + ww > width) {
        if (/^\s+$/.test(word)) continue; // drop the space at the wrap point
        out.push(line);
        line = "";
        lineW = 0;
      }
      if (ww <= width || /^\s+$/.test(word)) {
        line += word;
        lineW += ww;
      } else {
        // A single word longer than the line: hard-break it by grapheme.
        for (const g of splitGraphemes(word)) {
          const gw = charWidth(g);
          if (lineW + gw > width) {
            out.push(line);
            line = "";
            lineW = 0;
          }
          line += g;
          lineW += gw;
        }
      }
    }
    out.push(line);
  }
  return out;
}

/** Truncate `text` to `width` display columns, wide-char aware, with a trailing ellipsis. */
export function truncate(text: string, width: number): string {
  if (width <= 0) return "";
  if (stringWidth(text) <= width) return text;
  if (width === 1) return "…";
  let out = "";
  let w = 0;
  for (const g of splitGraphemes(text)) {
    const gw = charWidth(g);
    if (w + gw > width - 1) break;
    out += g;
    w += gw;
  }
  return `${out}…`;
}
