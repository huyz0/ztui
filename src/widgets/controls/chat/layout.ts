import { charWidth, stringWidth } from "../../../render/segment.ts";
import { type Atom, isChip } from "./model.ts";

/** One atom placed on a wrapped visual row, with its display width and start column. */
export interface PlacedAtom {
  index: number;
  atom: Atom;
  width: number;
  col: number;
}

export interface VisualRow {
  atoms: PlacedAtom[];
  /** First atom index on the row (== caret index at the row's left edge). */
  start: number;
  /** Caret index just past the row's last atom. */
  end: number;
}

/** Display width of one atom (chips include their pill/bracket chrome). */
export function atomWidth(atom: Atom): number {
  if (isChip(atom)) return stringWidth(atom.label) + 2;
  if (atom === "\n") return 0;
  return charWidth(atom);
}

/** Wrap `atoms` into visual rows for the given inner width. */
export function layoutRows(
  atoms: readonly Atom[],
  innerWidth: number,
  softWrap: boolean,
): VisualRow[] {
  const rows: VisualRow[] = [];
  let cur: PlacedAtom[] = [];
  let col = 0;
  let start = 0;
  const flush = (end: number, hadNewline: boolean) => {
    rows.push({ atoms: cur, start, end });
    cur = [];
    col = 0;
    start = hadNewline ? end + 1 : end;
  };
  for (let i = 0; i < atoms.length; i++) {
    const atom = atoms[i];
    if (atom === "\n") {
      flush(i, true);
      continue;
    }
    const w = atomWidth(atom);
    if (softWrap && col + w > innerWidth && cur.length > 0) {
      flush(i, false);
    }
    cur.push({ index: i, atom, width: w, col });
    col += w;
  }
  rows.push({ atoms: cur, start, end: atoms.length });
  return rows;
}

/** Locate the visual row + cell column for a caret atom-index. */
export function caretRowCol(rows: VisualRow[], caret: number): { row: number; col: number } {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (caret >= row.start && caret <= row.end) {
      let col = 0;
      for (const pa of row.atoms) {
        if (pa.index >= caret) break;
        col += pa.width;
      }
      return { row: r, col };
    }
  }
  const last = rows[rows.length - 1];
  return { row: rows.length - 1, col: last.atoms.reduce((s, a) => s + a.width, 0) };
}

/** Map a (row, targetCol) back to a caret atom-index (for Up/Down motion). */
export function indexAtRowCol(rows: VisualRow[], row: number, targetCol: number): number {
  const vr = rows[Math.max(0, Math.min(rows.length - 1, row))];
  if (vr.atoms.length === 0) return vr.start;
  for (const pa of vr.atoms) {
    if (targetCol <= pa.col + Math.floor(pa.width / 2)) return pa.index;
  }
  return vr.end;
}
