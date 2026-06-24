import { Segment, splitGraphemes, stringWidth } from "../segment.ts";

/** Take the longest prefix of `text` whose rendered width is `<= width`. */
export function sliceToWidth(text: string, width: number): string {
  let out = "";
  let w = 0;
  for (const ch of splitGraphemes(text)) {
    const cw = stringWidth(ch);
    if (w + cw > width) break;
    out += ch;
    w += cw;
  }
  // Guarantee forward progress even for a single too-wide glyph.
  return out || splitGraphemes(text)[0] || "";
}

/**
 * Greedy word-wrap of one already-newline-free styled line to `width` display
 * columns, preserving each segment's style across the break. Drops the trailing
 * space that caused a break and hard-splits words wider than the whole line.
 */
export function wrapSegmentLine(segs: Segment[], width: number): Segment[][] {
  const lines: Segment[][] = [];
  let cur: Segment[] = [];
  let curW = 0;

  const flush = () => {
    while (cur.length && /^\s+$/.test(cur[cur.length - 1].text)) cur.pop();
    lines.push(cur);
    cur = [];
    curW = 0;
  };

  for (const seg of segs) {
    const tokens = seg.text.match(/(\s+|\S+)/g) || [];
    for (let tok of tokens) {
      const tw = stringWidth(tok);
      if (curW + tw <= width) {
        cur.push(new Segment(tok, seg.style));
        curW += tw;
        continue;
      }
      // A run of spaces that overflows just ends the line.
      if (/^\s+$/.test(tok)) {
        if (cur.length) flush();
        continue;
      }
      // A word that doesn't fit: flush the current line first.
      if (curW > 0) flush();
      // Hard-split words longer than the whole width.
      while (stringWidth(tok) > width) {
        const head = sliceToWidth(tok, width);
        lines.push([new Segment(head, seg.style)]);
        tok = tok.slice(head.length);
      }
      if (tok.length) {
        cur.push(new Segment(tok, seg.style));
        curW = stringWidth(tok);
      }
    }
  }
  // Always emit a (possibly empty) trailing line so blank entries take a row.
  flush();
  return lines;
}
