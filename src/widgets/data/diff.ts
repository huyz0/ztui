import { App } from "../../core/app.ts";
import { runCols } from "../../core/selection.ts";
import { scrollTopForKey } from "../../dom/key-nav.ts";
import { Widget } from "../../dom/widget.ts";
import type { MouseEvent } from "../../driver/driver.ts";
import type { Region } from "../../geometry/region.ts";
import { parseDimension } from "../../layout/layout.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Syntax } from "../../render/rich/syntax.ts";
import { RichText } from "../../render/rich/text.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { handleReadonlySelectionMouse } from "../readonly-selection.ts";
import { maxRowScrollTop, trackYToScrollTop, wheelScrollTop } from "./row-scroll.ts";

/** How the diff is laid out: one column (unified) or two (side-by-side). */
/** Diff layout: unified or split. */
export type DiffView = "unified" | "split";

type LineOp = "equal" | "insert" | "delete";
interface DiffLine {
  op: LineOp;
  text: string;
}

/** One semantic row of the diff before it is turned into drawable segments. */
type RowKind = "context" | "add" | "del" | "hunk";
interface DiffRow {
  kind: RowKind;
  /** 1-based line number in the old text, or null (added / hunk rows). */
  oldNo: number | null;
  /** 1-based line number in the new text, or null (removed / hunk rows). */
  newNo: number | null;
  text: string;
}

/** A built display row: the segments to draw and its plain text (for copy). */
interface DisplayRow {
  segments: Segment[];
  plain: string;
  /** Color (or `$var`) to fill the whole row width with, behind the text. */
  fillBg?: string;
}

/** Myers-style LCS line diff. O(n*m) memory — fine for file-edit sized inputs. */
function lineDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[i:] and b[j:].
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: "equal", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ op: "delete", text: a[i] });
      i++;
    } else {
      out.push({ op: "insert", text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ op: "delete", text: a[i++] });
  while (j < m) out.push({ op: "insert", text: b[j++] });
  return out;
}

function splitLines(text: string): string[] {
  // A trailing newline shouldn't yield a spurious empty final line.
  const lines = text.split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * A side-by-side / unified code diff. Give it the `oldText` and `newText`
 * (and optionally a `language` for syntax highlighting) and it computes a
 * line diff, collapses long unchanged runs, and renders old/new line-number
 * gutters — the view a coding agent shows when proposing a file edit.
 *
 * ```tsx
 * <Diff language="ts" oldText={before} newText={after} />
 * ```
 *
 * Every line keeps its syntax highlighting; added/removed lines instead carry
 * a tinted background (green/red) across the full width, gutter included, so
 * the change reads at a glance without a `+/-` column. Long stretches of
 * unchanged lines collapse to a `⋯` marker unless {@link context} is
 * `Infinity`. The body scrolls when it overflows the available height.
 *
 * A clickable header row carries a "Unified / Split" toggle (suppress it with
 * `showToggle = false`); clicking a tab fires {@link onViewChange}.
 */
export class DiffWidget extends Widget {
  /** Original/before text. */
  public oldText = "";
  /** Updated/after text. */
  public newText = "";
  /** Language id for syntax highlighting. */
  public language = "text";
  /** Layout: unified or split. */
  public view: DiffView = "unified";
  /** Show line-number gutters. */
  public lineNumbers = true;
  /** Unchanged lines kept around each change; `Infinity` shows the whole file. */
  public context = 3;
  /** Show the clickable "Unified / Split" toggle in a header row. */
  public showToggle = true;
  /** Fired with the requested view when the toggle is clicked. */
  public declare onViewChange?: (view: DiffView) => void;

  private scrollTop = 0;
  private lastVisibleRows = 0;
  private draggingScrollbar = false;
  // Hit ranges for the header toggle, recorded each render for mouse handling.
  private toggleHit: { y: number; unified: [number, number]; split: [number, number] } | null =
    null;

  // Semantic rows, derived from the text inputs (dirty when inputs change).
  private rows: DiffRow[] = [];
  private modelKey = "";
  // Built display rows for the width recorded in `displayWidth`.
  private display: DisplayRow[] = [];
  private displayWidth = -1;
  // Last width actually used to build `display`, kept across an `ensureModel`
  // reset (which zeroes `displayWidth` to force a rebuild) so scroll/key
  // handlers can refresh the display on demand without needing to know the
  // current content width themselves.
  private lastContentWidth = -1;

  constructor() {
    super("diff");
    this.focusable = true;
    this.defaultStyle = { width: "100%" };
  }

  private resolver() {
    return (this.app ?? App.instance)?.cssResolver;
  }

  /** Rows reserved at the top for the clickable view toggle. */
  private headerHeight(): number {
    return this.showToggle ? 1 : 0;
  }

  private requestView(next: DiffView): void {
    if (next === this.view) return;
    this.onViewChange?.(next);
    this.app?.activeScreen.focusWidget(this);
  }

  /** Rebuild the semantic rows if any input changed. */
  private ensureModel(): void {
    const key = `${this.view}\u0000${this.context}\u0000${this.oldText}\u0000${this.newText}`;
    if (key === this.modelKey) return;
    this.modelKey = key;
    this.displayWidth = -1; // force display rebuild

    const diff = lineDiff(splitLines(this.oldText), splitLines(this.newText));
    const raw: DiffRow[] = [];
    let oldNo = 1;
    let newNo = 1;
    for (const d of diff) {
      if (d.op === "equal")
        raw.push({ kind: "context", oldNo: oldNo++, newNo: newNo++, text: d.text });
      else if (d.op === "delete")
        raw.push({ kind: "del", oldNo: oldNo++, newNo: null, text: d.text });
      else raw.push({ kind: "add", oldNo: null, newNo: newNo++, text: d.text });
    }
    this.rows = this.collapse(raw);
  }

  /** Collapse runs of context lines that sit more than `context` from a change. */
  private collapse(rows: DiffRow[]): DiffRow[] {
    if (!Number.isFinite(this.context)) return rows;
    const ctx = Math.max(0, this.context);
    const keep = new Array(rows.length).fill(false);
    rows.forEach((r, i) => {
      if (r.kind === "add" || r.kind === "del") {
        for (let k = Math.max(0, i - ctx); k <= Math.min(rows.length - 1, i + ctx); k++)
          keep[k] = true;
      }
    });
    const out: DiffRow[] = [];
    let i = 0;
    while (i < rows.length) {
      if (keep[i]) {
        out.push(rows[i]);
        i++;
        continue;
      }
      let j = i;
      while (j < rows.length && !keep[j]) j++;
      const n = j - i;
      out.push({
        kind: "hunk",
        oldNo: null,
        newNo: null,
        text: `⋯ ${n} unchanged line${n === 1 ? "" : "s"}`,
      });
      i = j;
    }
    return out;
  }

  /** Number of columns for the line-number gutter on one side. */
  private numWidth(): number {
    let max = 1;
    for (const r of this.rows) {
      if (r.oldNo && r.oldNo > max) max = r.oldNo;
      if (r.newNo && r.newNo > max) max = r.newNo;
    }
    return String(max).length;
  }

  private styleFor(color: string, background?: string): Style {
    return new Style({ color, background: background ?? this.findResolvedBackground() });
  }

  /** Syntax-highlighted segments for a code line, shifted to start at `xOffset`. */
  private codeSegments(text: string, base: Style): Segment[] {
    let rich: RichText;
    try {
      rich = Syntax.highlight(text, this.language, this.theme || "theme");
    } catch {
      rich = new RichText(text, []);
    }
    return rich.toSegments(base);
  }

  /** Build the drawable rows for a given content width. */
  private rebuildDisplay(width: number): void {
    const numW = this.lineNumbers ? this.numWidth() : 0;
    this.display = this.view === "split" ? this.buildSplit(numW, width) : this.buildUnified(numW);
    this.displayWidth = width;
    this.lastContentWidth = width;
  }

  private buildUnified(numW: number): DisplayRow[] {
    const fg = this.computedStyle.color || "default";
    return this.rows.map((r) => {
      if (r.kind === "hunk") {
        const text = r.text;
        return {
          segments: [new Segment(text, this.styleFor("$diff-header").merge({ dim: true }))],
          plain: text,
        };
      }
      // Added/removed rows get a tinted background across the full width (gutter
      // included); the row color alone marks the change, so there's no +/- sign.
      const fillBg =
        r.kind === "add" ? "$diff-added-bg" : r.kind === "del" ? "$diff-removed-bg" : undefined;
      const rowBg = fillBg ?? this.findResolvedBackground();
      const codeBase = this.styleFor(fg, rowBg);

      const segs: Segment[] = [];
      let plain = "";
      if (numW > 0) {
        const oldS = (r.oldNo ? String(r.oldNo) : "").padStart(numW);
        const newS = (r.newNo ? String(r.newNo) : "").padStart(numW);
        const gutter = `${oldS} ${newS} `;
        segs.push(new Segment(gutter, this.styleFor("$gutter", rowBg).merge({ dim: true })));
        plain += gutter;
      }
      segs.push(...this.codeSegments(r.text, codeBase));
      plain += r.text;
      return { segments: segs, plain, fillBg };
    });
  }

  /** Side-by-side: old (context+del) on the left, new (context+add) on the right. */
  private buildSplit(numW: number, width: number): DisplayRow[] {
    const fg = this.computedStyle.color || "default";
    const widgetBg = this.findResolvedBackground();
    const dividerStyle = this.styleFor("$gutter").merge({ dim: true });
    const divider = "│";
    const paneW = Math.max(4, Math.floor((width - 1) / 2));

    type Cell = { no: number | null; text: string; kind: RowKind };
    const left: Cell[] = [];
    const right: Cell[] = [];

    // Pair blocks of del/add between equal lines so changes line up.
    const flush = (dels: DiffRow[], adds: DiffRow[]) => {
      const n = Math.max(dels.length, adds.length);
      for (let k = 0; k < n; k++) {
        const d = dels[k];
        const a = adds[k];
        left.push(
          d ? { no: d.oldNo, text: d.text, kind: "del" } : { no: null, text: "", kind: "context" },
        );
        right.push(
          a ? { no: a.newNo, text: a.text, kind: "add" } : { no: null, text: "", kind: "context" },
        );
      }
    };

    let dels: DiffRow[] = [];
    let adds: DiffRow[] = [];
    const out: DisplayRow[] = [];

    // Render one pane, tinted by its kind and padded with that tint to `paneW`.
    const renderPane = (c: Cell): Segment[] => {
      const bg =
        c.kind === "add" ? "$diff-added-bg" : c.kind === "del" ? "$diff-removed-bg" : widgetBg;
      const segs: Segment[] = [];
      if (numW > 0) {
        const num = (c.no ? String(c.no) : "").padStart(numW);
        segs.push(new Segment(`${num} `, this.styleFor("$gutter", bg).merge({ dim: true })));
      }
      if (c.text.length > 0) segs.push(...this.codeSegments(c.text, this.styleFor(fg, bg)));
      const clamped = clampSegments(segs, paneW);
      const w = clamped.reduce((s, x) => s + stringWidth(x.text), 0);
      if (w < paneW) clamped.push(new Segment(" ".repeat(paneW - w), this.styleFor(fg, bg)));
      return clamped;
    };

    const emit = () => {
      // Zip the paired left/right cells into combined rows.
      for (let k = 0; k < Math.max(left.length, right.length); k++) {
        const l = left[k] ?? { no: null, text: "", kind: "context" as RowKind };
        const r = right[k] ?? { no: null, text: "", kind: "context" as RowKind };
        const segments: Segment[] = [
          ...renderPane(l),
          new Segment(divider, dividerStyle),
          ...renderPane(r),
        ];
        out.push({ segments, plain: segments.map((s) => s.text).join("") });
      }
      left.length = 0;
      right.length = 0;
    };

    for (const r of this.rows) {
      if (r.kind === "hunk") {
        flush(dels, adds);
        dels = [];
        adds = [];
        emit();
        out.push({
          segments: [new Segment(r.text, this.styleFor("$diff-header").merge({ dim: true }))],
          plain: r.text,
        });
        continue;
      }
      if (r.kind === "del") {
        dels.push(r);
        continue;
      }
      if (r.kind === "add") {
        adds.push(r);
        continue;
      }
      // context: settle any pending change block, then add to both panes.
      flush(dels, adds);
      dels = [];
      adds = [];
      left.push({ no: r.oldNo, text: r.text, kind: "context" });
      right.push({ no: r.newNo, text: r.text, kind: "context" });
    }
    flush(dels, adds);
    emit();
    return out;
  }

  private ensureDisplay(width: number): void {
    this.ensureModel();
    if (this.displayWidth !== width) this.rebuildDisplay(width);
  }

  /** Plain text of every display row, for cross-widget copy. */
  public selectableLines(): string[] {
    if (this.displayWidth >= 0) return this.display.map((r) => r.plain);
    return [];
  }

  public override measure(maxW: number, maxH: number): void {
    this.ensureModel();
    const wVal = parseDimension(this.computedStyle.width, maxW, -1);
    if (wVal === -1 || (typeof wVal === "object" && "fr" in wVal)) {
      this.ensureDisplay(Math.max(1, maxW));
      let w = 0;
      for (const r of this.display) {
        const rw = r.segments.reduce((s, x) => s + stringWidth(x.text), 0);
        if (rw > w) w = rw;
      }
      this.measuredWidth = w + this.borderSize.width + this.padding.width;
    } else {
      this.measuredWidth = wVal as number;
    }

    const hVal = parseDimension(this.computedStyle.height, maxH, -1);
    if (hVal === -1 || (typeof hVal === "object" && "fr" in hVal)) {
      // Use the actual display row count, not the unified semantic row count
      // (this.rows.length) — in split view, buildSplit zips paired add/delete
      // blocks to Math.max(dels.length, adds.length) rows per block, which
      // diverges from this.rows.length whenever a change block is imbalanced.
      const contentW = Math.max(1, this.measuredWidth - this.borderSize.width - this.padding.width);
      this.ensureDisplay(contentW);
      this.measuredHeight =
        this.display.length + this.headerHeight() + this.borderSize.height + this.padding.height;
    } else {
      this.measuredHeight = hVal as number;
    }
  }

  private maxScrollTop(visibleRows: number): number {
    return maxRowScrollTop(this.display.length, visibleRows);
  }

  /**
   * Refresh `display` on demand if a prop change (e.g. toggling Unified/Split)
   * left it stale — `ensureModel`/`rebuildDisplay` otherwise only run inside
   * `measure()`/`render()`, so a key or wheel event arriving before the next
   * render would clamp `scrollTop` against the old view's row count.
   */
  private ensureFreshDisplay(): void {
    this.ensureModel();
    if (this.displayWidth === -1 && this.lastContentWidth >= 0) {
      this.rebuildDisplay(this.lastContentWidth);
    }
  }

  public override handleScroll(ev: any): void {
    super.handleScroll(ev);
    if (ev.handled) return;
    this.ensureFreshDisplay();
    const next = wheelScrollTop(ev.type, this.scrollTop, this.maxScrollTop(this.lastVisibleRows));
    if (next !== null) {
      this.scrollTop = next;
      ev.handled = true;
      (this.app ?? App.instance)?.queueRender();
    }
  }

  public override handleKey(ev: any): void {
    super.handleKey(ev);
    if (ev.handled) return;
    this.ensureFreshDisplay();
    const max = this.maxScrollTop(this.lastVisibleRows);
    const next = scrollTopForKey(ev.name || ev.key, this.scrollTop, max, this.lastVisibleRows);
    if (next !== null) {
      this.scrollTop = next;
      ev.handled = true;
      (this.app ?? App.instance)?.queueRender();
    }
  }

  public override handleMouse(ev: MouseEvent): void {
    super.handleMouse(ev);
    if (ev.handled) return;

    if (ev.type === "release" && this.draggingScrollbar) {
      this.draggingScrollbar = false;
      ev.handled = true;
      return;
    }
    if (ev.type === "drag" && this.draggingScrollbar) {
      this.scrollToTrackY(ev.y);
      ev.handled = true;
      return;
    }
    if (ev.type === "press" && ev.button === "left") {
      // Header toggle: click a tab to switch view.
      const hit = this.toggleHit;
      if (hit && ev.y === hit.y) {
        if (ev.x >= hit.unified[0] && ev.x < hit.unified[1]) {
          this.requestView("unified");
          ev.handled = true;
          return;
        }
        if (ev.x >= hit.split[0] && ev.x < hit.split[1]) {
          this.requestView("split");
          ev.handled = true;
          return;
        }
      }

      const content = this.getContentRect();
      const bodyTop = content.y + this.headerHeight();
      if (
        this.display.length > this.lastVisibleRows &&
        ev.x === content.right - 1 &&
        ev.y >= bodyTop &&
        ev.y < content.bottom
      ) {
        this.draggingScrollbar = true;
        this.scrollToTrackY(ev.y);
        ev.handled = true;
        return;
      }
    }
    handleReadonlySelectionMouse(this, ev);
  }

  private scrollToTrackY(y: number): void {
    const v = this.lastVisibleRows;
    const bodyTop = this.getContentRect().y + this.headerHeight();
    const next = trackYToScrollTop(y, bodyTop, v, this.maxScrollTop(v));
    if (next === null) return;
    this.scrollTop = next;
    (this.app ?? App.instance)?.queueRender();
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;
    super.render(buffer);
    const content = this.getContentRect();
    if (content.width <= 0 || content.height <= 0) return;

    const headerH = this.headerHeight();
    const bodyTop = content.y + headerH;
    const visibleRows = Math.max(0, Math.floor(content.height) - headerH);
    this.lastVisibleRows = visibleRows;

    const resolver = this.resolver();
    const resolve = (c?: string) =>
      c?.startsWith("$") && resolver ? resolver.resolveVariable(this, c) || c : c;

    if (headerH > 0) this.renderToggle(buffer, content, resolve);

    this.ensureDisplay(content.width);
    const needScrollbar = this.display.length > visibleRows;
    if (needScrollbar && this.view === "split") {
      // Re-flow split panes into the narrower body so text clears the scrollbar.
      this.ensureDisplay(Math.max(1, content.width - 1));
    }
    const bodyW = needScrollbar ? Math.max(0, content.width - 1) : content.width;

    const max = this.maxScrollTop(visibleRows);
    this.scrollTop = Math.max(0, Math.min(this.scrollTop, max));

    const first = this.scrollTop;
    const last = Math.min(this.display.length, first + visibleRows);
    for (let i = first; i < last; i++) {
      const row = this.display[i];
      const y = bodyTop + (i - first);

      // Lay down the row tint across the full body width first, so the gutter
      // and any trailing space share the added/removed background.
      const fill = resolve(row.fillBg);
      if (fill) {
        const fillStyle = new Style({ background: fill });
        for (let fx = content.x; fx < content.x + bodyW; fx++) {
          buffer.setCell(fx, y, " ", fillStyle);
        }
      }

      let x = content.x;
      for (const seg of row.segments) {
        if (x >= content.x + bodyW) break;
        const drawn = new Segment(
          seg.text,
          seg.style.merge({
            color: resolve(seg.style.color),
            background: resolve(seg.style.background),
          }),
        );
        buffer.drawSegment(x, y, drawn, content);
        x += stringWidth(seg.text);
      }
      if (this.selectable && row.plain.length > 0) {
        const cols = runCols(row.plain).slice(0, bodyW);
        if (cols.length > 0) {
          (this.app ?? App.instance)?.selection.addRun({
            widget: this,
            line: i,
            y,
            x: content.x,
            cols,
          });
        }
      }
    }

    if (needScrollbar) {
      const trackH = visibleRows;
      const thumbH = Math.max(1, Math.round((visibleRows / this.display.length) * trackH));
      const ratio = max > 0 ? this.scrollTop / max : 0;
      const thumbStart = bodyTop + Math.round(ratio * (trackH - thumbH));
      const x = content.right - 1;
      const style = this.styleFor(
        this.computedStyle.borderColor || this.computedStyle.color || "default",
      );
      for (let yy = bodyTop; yy < bodyTop + trackH; yy++) {
        const isThumb = yy >= thumbStart && yy < thumbStart + thumbH;
        buffer.setCell(x, yy, isThumb ? "█" : "░", style);
      }
    }
  }

  /** Draw the "Unified / Split" toggle on the header row and record hit ranges. */
  private renderToggle(
    buffer: ScreenBuffer,
    content: Region,
    resolve: (c?: string) => string | undefined,
  ): void {
    const y = content.y;
    const bg = this.findResolvedBackground();
    const accent = resolve(this.computedStyle.borderColor || "$primary") || "default";

    const uniText = " Unified ";
    const splitText = " Split ";
    // Right-align the toggle within the content width.
    const total = stringWidth(uniText) + 1 + stringWidth(splitText);
    let x = Math.max(content.x, content.right - total);

    const put = (text: string, style: Style): [number, number] => {
      const start = x;
      buffer.drawSegment(x, y, new Segment(text, style), content);
      x += stringWidth(text);
      return [start, x];
    };

    const tabStyle = (active: boolean) =>
      active
        ? new Style({ color: bg, background: accent, bold: true })
        : new Style({ color: resolve("$gutter"), background: bg });

    const unified = put(uniText, tabStyle(this.view === "unified"));
    put(" ", new Style({ background: bg }));
    const split = put(splitText, tabStyle(this.view === "split"));
    this.toggleHit = { y, unified, split };
  }
}

/** Truncate a segment list to a maximum rendered width. */
function clampSegments(segs: Segment[], width: number): Segment[] {
  const out: Segment[] = [];
  let w = 0;
  for (const seg of segs) {
    const sw = stringWidth(seg.text);
    if (w + sw <= width) {
      out.push(seg);
      w += sw;
      continue;
    }
    let text = "";
    let tw = 0;
    for (const ch of seg.text) {
      const cw = stringWidth(ch);
      if (w + tw + cw > width) break;
      text += ch;
      tw += cw;
    }
    if (text) out.push(new Segment(text, seg.style));
    break;
  }
  return out;
}
