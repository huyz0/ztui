import type { DOMNode } from "../dom/dom.ts";
import { Widget } from "../dom/widget.ts";
import type { Cell, ScreenBuffer } from "../render/buffer.ts";
import { splitGraphemes, stringWidth } from "../render/segment.ts";
import { extractSelection, type Pos } from "../render/text-selection.ts";

/**
 * Read-only text selection over display widgets, defined in *logical content*
 * space rather than screen cells. A selectable widget exposes its true content
 * (`selectableLines`, the "core value" with no chrome) and, each frame, registers
 * the runs that map its on-screen cells to logical `(line, col)` positions. The
 * App composes these per-widget models in document order, so a selection is a
 * range that crosses widget/nesting boundaries, highlights only content cells,
 * copies the real value (including content scrolled off-screen), and never starts
 * on chrome (borders, gutters, bullets). See `docs/architecture.md` §5.1b.
 */

/** A widget that owns selectable text content. Duck-typed (no `implements`). */
export interface SelectableWidget {
  /** Logical content as lines — the full "core value", not just visible cells. */
  selectableLines(): string[];
}

/** A logical selection endpoint: a grapheme column on a content line of a widget. */
export interface SelPoint {
  widget: Widget;
  line: number;
  col: number;
}

/**
 * One rendered row of a widget's content for the current frame. `cols[i]` is the
 * logical column shown at screen column `x + i` (−1 for a wide-glyph continuation
 * cell). Chrome draws register no runs, which is what excludes them everywhere.
 */
export interface SelectableRun {
  widget: Widget;
  line: number;
  y: number;
  x: number;
  cols: number[];
}

export interface ActiveReadonlySelection {
  group: Widget;
  anchor: SelPoint;
  caret: SelPoint;
}

function isSelectable(node: unknown): node is Widget & SelectableWidget {
  return (
    node instanceof Widget &&
    node.selectable &&
    typeof (node as unknown as SelectableWidget).selectableLines === "function"
  );
}

/** Per-screen-column logical columns for `text` starting at logical column `first`. */
export function runCols(text: string, first = 0): number[] {
  const cols: number[] = [];
  let c = first;
  for (const g of splitGraphemes(text)) {
    cols.push(c);
    for (let k = 1; k < stringWidth(g); k++) cols.push(-1);
    c++;
  }
  return cols;
}

export class ReadonlySelectionManager {
  private runs: SelectableRun[] = [];
  public active: ActiveReadonlySelection | null = null;

  /** Reset the per-frame run registry; called before the render walk. */
  public beginFrame(): void {
    // Reuse the array (length reset) instead of allocating a new one each frame —
    // every selectable widget pushes its visible runs here on every render.
    this.runs.length = 0;
  }

  /** Register a content run; called by selectable widgets during `render`. */
  public addRun(run: SelectableRun): void {
    this.runs.push(run);
  }

  /**
   * Logical point under a screen cell. An exact content cell maps directly;
   * otherwise the cursor snaps to the **closest content** — nearest row first
   * (vertical distance dominates), then the nearest edge on that row. This lets
   * a press on chrome (gutter, bullet, gap) anchor a selection on the adjacent
   * content instead of being refused, and keeps a drag tracking past line ends.
   * Returns null only when no content is rendered at all.
   */
  public pointFromScreen(x: number, y: number): SelPoint | null {
    let best: SelectableRun | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const run of this.runs) {
      const left = run.x;
      const right = run.x + run.cols.length;
      if (run.y === y && x >= left && x < right) {
        const col = this.colInRun(run, x - run.x);
        return { widget: run.widget, line: run.line, col };
      }
      // Weighted distance: a row away costs more than any horizontal offset, so
      // the nearest line wins and ties resolve to the closest column.
      const dy = Math.abs(run.y - y);
      const dx = x < left ? left - x : x >= right ? x - (right - 1) : 0;
      const dist = dy * 10_000 + dx;
      if (dist < bestDist) {
        bestDist = dist;
        best = run;
      }
    }
    if (best) {
      const col =
        x < best.x
          ? this.colInRun(best, 0)
          : x >= best.x + best.cols.length
            ? this.colInRun(best, best.cols.length - 1) + 1
            : this.colInRun(best, x - best.x);
      return { widget: best.widget, line: best.line, col };
    }
    return null;
  }

  /** Logical column for an in-run screen offset, walking left off a continuation. */
  private colInRun(run: SelectableRun, offset: number): number {
    for (let i = offset; i >= 0; i--) {
      if (run.cols[i] >= 0) return run.cols[i];
    }
    return 0;
  }

  /** Paint the theme selection colours over the selected content cells only. */
  public paint(buffer: ScreenBuffer, resolve: (w: Widget, v: string) => string): void {
    const sel = this.active;
    if (!sel) return;
    const order = this.docOrder(sel.group);
    const [start, end] = this.ordered(sel.anchor, sel.caret, order);
    if (this.compare(start, end, order) === 0) return; // empty selection

    const selBg = resolve(sel.group, "$selectionBg") || "#585b70";
    const selFg = resolve(sel.group, "$selectionFg") || "default";
    const selStyle = { color: selFg, background: selBg };

    for (const run of this.runs) {
      if (!order.has(run.widget)) continue;
      for (let i = 0; i < run.cols.length; i++) {
        const c = run.cols[i];
        // A wide glyph's second screen column is a continuation cell (c < 0)
        // with no logical column of its own — resolve it to the column of
        // the glyph it belongs to (same walk-left as colInRun) so it's
        // checked against the selection range instead of being skipped
        // outright, which left it unhighlighted even when fully selected.
        const p: SelPoint = {
          widget: run.widget,
          line: run.line,
          col: c >= 0 ? c : this.colInRun(run, i),
        };
        if (this.compare(start, p, order) <= 0 && this.compare(p, end, order) < 0) {
          const cell: Cell | undefined = buffer.cells[run.y]?.[run.x + i];
          if (cell) cell.style = cell.style.merge(selStyle);
        }
      }
    }
  }

  /**
   * The selected text across all widgets in document order, using each widget's
   * full `selectableLines()` so content scrolled off-screen still copies. A
   * subtree carrying `selectionRaw` (e.g. a Markdown block) whose content is
   * fully covered emits its original source verbatim — so copied markdown keeps
   * its `**bold**` / `# heading` / list formatting; partially-selected boundary
   * blocks fall back to slicing the rendered text. Returns null when empty.
   */
  public copy(): string | null {
    const sel = this.active;
    if (!sel) return null;
    const order = this.docOrder(sel.group);
    const [start, end] = this.ordered(sel.anchor, sel.caret, order);
    if (this.compare(start, end, order) === 0) return null;

    const si = order.get(start.widget) ?? 0;
    const ei = order.get(end.widget) ?? 0;
    const parts: string[] = [];

    const emit = (node: DOMNode): void => {
      if (node instanceof Widget && node.selectionRaw != null) {
        const covered = this.subtreeCoverage(node, start, end, order, si, ei);
        if (covered === "full") {
          parts.push(node.selectionRaw);
          return; // raw source replaces the whole subtree
        }
        if (covered === "none") return; // skip uncovered subtrees wholesale
      }
      if (isSelectable(node)) {
        const idx = order.get(node) ?? -1;
        if (idx >= si && idx <= ei) {
          const lines = node.selectableLines();
          if (lines.length > 0) {
            const lastLine = lines.length - 1;
            const s: Pos =
              node === start.widget ? { row: start.line, col: start.col } : { row: 0, col: 0 };
            const e: Pos =
              node === end.widget
                ? { row: end.line, col: end.col }
                : { row: lastLine, col: [...lines[lastLine]].length };
            parts.push(extractSelection(lines, clampPos(s, lines), clampPos(e, lines)));
          }
        }
      }
      for (const child of node.children) emit(child);
    };
    emit(sel.group);

    const text = parts.join("\n");
    return text === "" ? null : text;
  }

  /**
   * How much of a subtree's selectable content the range covers: "full" when
   * every content widget inside lies strictly within the range (or the range
   * endpoints sit at the very start/end of its boundary widgets), "none" when
   * the subtree is entirely outside, "partial" otherwise.
   */
  private subtreeCoverage(
    node: Widget,
    start: SelPoint,
    end: SelPoint,
    order: Map<Widget, number>,
    si: number,
    ei: number,
  ): "full" | "partial" | "none" {
    const leaves: (Widget & SelectableWidget)[] = [];
    const collect = (n: DOMNode): void => {
      if (isSelectable(n)) leaves.push(n);
      for (const c of n.children) collect(c);
    };
    collect(node);
    if (leaves.length === 0) return "none";

    const fi = order.get(leaves[0]) ?? 0;
    const li = order.get(leaves[leaves.length - 1]) ?? 0;
    if (li < si || fi > ei) return "none";
    if (fi < si || li > ei) return "partial";

    const first = leaves[0];
    const last = leaves[leaves.length - 1];
    const startCovers = fi > si || (first === start.widget && start.line === 0 && start.col === 0);
    let endCovers = li < ei;
    if (!endCovers && last === end.widget) {
      const lines = last.selectableLines();
      const lastLine = lines.length - 1;
      endCovers = end.line >= lastLine && end.col >= [...(lines[lastLine] ?? "")].length;
    }
    return startCovers && endCovers ? "full" : "partial";
  }

  /** Document-order index for every Widget in the group's subtree (preorder DFS). */
  private docOrder(group: Widget): Map<Widget, number> {
    const order = new Map<Widget, number>();
    let i = 0;
    const visit = (node: DOMNode): void => {
      if (node instanceof Widget) order.set(node, i++);
      for (const child of node.children) visit(child);
    };
    visit(group);
    return order;
  }

  private compare(a: SelPoint, b: SelPoint, order: Map<Widget, number>): number {
    const ia = order.get(a.widget) ?? 0;
    const ib = order.get(b.widget) ?? 0;
    if (ia !== ib) return ia - ib;
    if (a.line !== b.line) return a.line - b.line;
    return a.col - b.col;
  }

  private ordered(a: SelPoint, b: SelPoint, order: Map<Widget, number>): [SelPoint, SelPoint] {
    return this.compare(a, b, order) <= 0 ? [a, b] : [b, a];
  }
}

/** Clamp a logical position to a lines array (guards against stale line/col). */
function clampPos(p: Pos, lines: string[]): Pos {
  const row = Math.max(0, Math.min(lines.length - 1, p.row));
  return { row, col: Math.max(0, Math.min([...lines[row]].length, p.col)) };
}
