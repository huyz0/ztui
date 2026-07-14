import { App } from "../../core/app.ts";
import { runCols } from "../../core/selection.ts";
import { fadeScrollEdges } from "../../dom/scroll-fade.ts";
import { scrollbarTrackStyle } from "../../dom/scrollbar.ts";
import type { AccessibleNode } from "../../dom/widget.ts";
import { Widget } from "../../dom/widget.ts";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { charWidth, Segment, stringWidth } from "../../render/segment.ts";
import type { Style } from "../../render/style.ts";
import { handleReadonlySelectionMouse } from "../readonly-selection.ts";
import { buildGroupedRows, type GroupedRow, initialCollapsed, type RowGroup } from "./grouping.ts";
import { maxRowScrollTop, trackYToScrollTop, wheelScrollTop } from "./row-scroll.ts";

/** Sort direction for a {@link TableColumn}. */
export type SortDirection = "asc" | "desc";

/** Which column a {@link TableWidget} is sorted by, and in which direction. */
export interface SortState {
  /** The sorted column's `key`. */
  key: string;
  /** Ascending or descending. */
  direction: SortDirection;
}

/** A {@link Table} column: how to read, size, render, and sort one field. */
export interface TableColumn<Row = any> {
  /** Stable identifier; also the default data accessor (`row[key]`). */
  key: string;
  /** Header label. */
  header: string;
  /**
   * Column width:
   *  - `number` — fixed cell count
   *  - `"<n>fr"` — flexible, shares leftover space proportionally
   *  - `"auto"` (or omitted) — sized to the widest visible cell
   */
  width?: number | string;
  /** Minimum column width in cells. */
  minWidth?: number;
  /** Maximum column width in cells. */
  maxWidth?: number;
  /** Cell text alignment. */
  align?: "left" | "center" | "right";
  /** Whether clicking the header toggles sorting on this column. */
  sortable?: boolean;
  /** Text accessor for a cell. Defaults to `String(row[key])`. */
  cell?: (row: Row, rowIndex: number) => string;
  /**
   * Renders a widget-bearing cell instead of text. Returns a framework node
   * (e.g. a React element); only visible rows are materialized. Typed as
   * `unknown` here to keep the widget layer framework-neutral — the React
   * `<Table>` narrows it.
   */
  render?: (row: Row, rowIndex: number) => unknown;
  /** Custom comparator; defaults to numeric/locale comparison of the sort value. */
  compare?: (a: Row, b: Row) => number;
}

const GAP = 1; // cells between columns

/** Text-formatting options for the header row (framework-neutral subset). */
export interface TableTextStyle {
  /** Text color. */
  color?: string;
  /** Background color. */
  background?: string;
  /** Bold. */
  bold?: boolean;
  /** Italic. */
  italic?: boolean;
  /** Underlined. */
  underline?: boolean;
  /** Dim. */
  dim?: boolean;
  /** Reverse video. */
  reverse?: boolean;
  /** Struck-through. */
  strikethrough?: boolean;
}

/**
 * A virtualized, sortable, scrollable data table with a fixed header.
 *
 * The body is *self-rendered* (no per-row child widgets), so it scales to
 * arbitrarily large `data` arrays: only the rows inside the current viewport
 * window are drawn each frame. Sorting reorders an index array over the
 * untouched source data rather than copying rows.
 */
export class TableWidget<Row = any> extends Widget {
  /** Source rows; only the visible window is rendered. Ignored when {@link groups} is set. */
  public data: Row[] = [];
  /**
   * Grouped mode: each group renders a non-interactive title row (spanning all
   * columns) followed by its item rows; clicking a title collapses/expands the
   * group. When set, this supersedes {@link data}, and `sort` and rich
   * (`column.render`) cells are ignored — grouped tables render text columns.
   */
  public groups: RowGroup<Row>[] | null = null;
  /** Column definitions. */
  public columns: TableColumn<Row>[] = [];
  /** Height of each row in cells. */
  public rowHeight = 1;
  /** Whether the header row is shown. */
  public showHeader = true;
  /**
   * Formatting for the header row. Bold is applied by default; any field set
   * here overrides it (e.g. `{ bold: false }` for a plain header, or a custom
   * `color`/`background`).
   */
  public headerStyle: TableTextStyle = {};
  /** Selected row in *view* (display) order, or -1 for none. */
  public selectedIndex = -1;
  /** Active sort. Controlled when `onSortChange` is set, otherwise internal. */
  public sort: SortState | null = null;

  /** Background color painted across the selected row (and inherited by its cells). */
  public selectedBackground = "$selectionBg";

  /** {@link selectedBackground} with theme variables resolved to a concrete color. */
  private resolvedSelectedBackground(): string {
    return (
      (this.app ?? App.instance)?.cssResolver.resolveVariable(this, this.selectedBackground) ??
      "#264f78"
    );
  }

  /** Selection changed (arrow navigation or single click). */
  public declare onSelect?: (row: Row, viewIndex: number) => void;
  /** Row activated — Enter or double-click (the "open it" intent). */
  public declare onActivate?: (row: Row, viewIndex: number) => void;
  public declare onSortChange?: (sort: SortState | null) => void;
  /** A group was collapsed or expanded (grouped mode). */
  public declare onToggleGroup?: (id: string, collapsed: boolean) => void;
  /**
   * Reports the visible row window so a stateful `<Table>` can render
   * widget-bearing cells (`column.render`) only for on-screen rows.
   */
  public declare onViewportChange?: (window: { first: number; dataIndices: number[] }) => void;

  // ---- grouping state -------------------------------------------------------
  /** Ids of collapsed groups (grouped mode). */
  private collapsed = new Set<string>();
  private collapsedSeeded = false;
  private vrCache: GroupedRow<Row>[] | null = null;
  private vrCacheGroups: RowGroup<Row>[] | null = null;
  private collapseVersion = 0;
  private vrCacheVersion = -1;

  private lastViewportSig = "";
  private suppressChildren = false;
  private draggingScrollbar = false;

  // Double-click detection (no driver support; measured here).
  private lastClickIndex = -1;
  private lastClickAt = 0;
  private static readonly DOUBLE_CLICK_MS = 400;

  /** Vertical scroll measured in rows. */
  private scrollTop = 0;
  /** Horizontal scroll measured in cells. */
  private scrollLeft = 0;

  /** display-order -> data-index mapping (post-sort). */
  private viewIndex: number[] = [];
  private lastData: Row[] | null = null;
  private lastSortSig = "\0";

  // Geometry captured at render time so key/mouse handlers can reason about
  // the viewport without re-deriving layout.
  private lastVisibleRows = 0;
  private lastBodyTop = 0;
  private lastColWidths: number[] = [];
  private lastContentWidth = 0;

  constructor() {
    super("table");
    this.focusable = true;
    // A table fills the space offered to it unless the caller overrides size.
    this.defaultStyle = { width: "100%", height: "100%" };
  }

  // ---- data / sorting -------------------------------------------------------

  private get headerHeight(): number {
    return this.showHeader ? 1 : 0;
  }

  private sortValue(col: TableColumn<Row>, row: Row, dataIndex: number): string | number {
    const raw = (row as any)?.[col.key];
    if (raw !== undefined && raw !== null) return raw;
    return col.cell ? col.cell(row, dataIndex) : "";
  }

  /** Cell text for an explicit row (used by both flat and grouped paths). */
  private cellTextFor(col: TableColumn<Row>, row: Row, rowIndex: number): string {
    if (col.cell) return col.cell(row, rowIndex);
    const raw = (row as any)?.[col.key];
    return raw === undefined || raw === null ? "" : String(raw);
  }

  private ensureViewIndex(): void {
    if (this.grouped) return; // grouped mode ignores sort and uses visual rows
    const sort = this.sort;
    const sig = sort ? `${sort.key}:${sort.direction}` : "";
    if (
      this.lastData === this.data &&
      this.lastSortSig === sig &&
      this.viewIndex.length === this.data.length
    ) {
      return;
    }

    this.viewIndex = this.data.map((_, i) => i);

    if (sort) {
      const col = this.columns.find((c) => c.key === sort.key);
      if (col) {
        const dir = sort.direction === "asc" ? 1 : -1;
        if (col.compare) {
          const compare = col.compare;
          this.viewIndex.sort((a, b) => dir * compare(this.data[a], this.data[b]));
        } else {
          // No custom comparator: fall back to each row's real data index (not
          // a hardcoded 0) so a `col.cell(row, rowIndex)` accessor that
          // depends on the row's position sorts correctly for every row, not
          // just the first.
          this.viewIndex.sort((a, b) => {
            const av = this.sortValue(col, this.data[a], a);
            const bv = this.sortValue(col, this.data[b], b);
            if (typeof av === "number" && typeof bv === "number") return dir * (av - bv);
            return dir * String(av).localeCompare(String(bv));
          });
        }
      }
    }

    this.lastData = this.data;
    this.lastSortSig = sig;
  }

  /** Cycle a column's sort asc -> desc -> none. Honors controlled mode. */
  public toggleSort(key: string): void {
    const current = this.sort;
    let next: SortState | null;
    if (!current || current.key !== key) next = { key, direction: "asc" };
    else if (current.direction === "asc") next = { key, direction: "desc" };
    else next = null;

    if (this.onSortChange) {
      this.onSortChange(next);
    } else {
      this.sort = next;
    }
    this.requestRender();
  }

  /**
   * Queue a frame after a self-driven state change. The App's input loop also
   * re-renders after dispatching events, so this mainly covers programmatic
   * mutations (and keeps the widget correct when handlers are invoked directly).
   */
  private requestRender(): void {
    App.instance?.queueRender();
  }

  // ---- grouping -------------------------------------------------------------

  /** True when the table is showing grouped (sectioned) data. */
  private get grouped(): boolean {
    return this.groups !== null;
  }

  private ensureCollapsedSeeded(): void {
    if (this.collapsedSeeded || !this.groups) return;
    this.collapsed = initialCollapsed(this.groups);
    this.collapsedSeeded = true;
  }

  /** Memoized flattened visual rows for grouped mode. */
  private visualRows(): GroupedRow<Row>[] {
    this.ensureCollapsedSeeded();
    if (
      this.vrCache &&
      this.vrCacheGroups === this.groups &&
      this.vrCacheVersion === this.collapseVersion
    ) {
      return this.vrCache;
    }
    this.vrCache = buildGroupedRows(this.groups ?? [], this.collapsed);
    this.vrCacheGroups = this.groups;
    this.vrCacheVersion = this.collapseVersion;
    return this.vrCache;
  }

  /** The header row at view index `v`, or null when it is an item/flat row. */
  private headerAtView(v: number): Extract<GroupedRow<Row>, { kind: "header" }> | null {
    if (!this.grouped) return null;
    const row = this.visualRows()[v];
    return row && row.kind === "header" ? row : null;
  }

  /** The data row at view index `v` (post-sort flat, or grouped item); null for a header. */
  private rowAtView(v: number): { row: Row; rowIndex: number } | null {
    if (this.grouped) {
      const row = this.visualRows()[v];
      // `rowIndex` is the row's position within its own group (not the
      // visual index `v`, which also counts interleaved group-header rows
      // and shifts whenever a group above is collapsed/expanded).
      return row && row.kind === "item" ? { row: row.item, rowIndex: row.itemIndex } : null;
    }
    const di = this.viewIndex[v];
    return di === undefined ? null : { row: this.data[di], rowIndex: di };
  }

  /** Toggle a group's collapsed state (grouped mode). */
  public toggleGroup(id: string): void {
    if (this.collapsed.has(id)) this.collapsed.delete(id);
    else this.collapsed.add(id);
    this.collapseVersion++;
    this.onToggleGroup?.(id, this.collapsed.has(id));
    this.requestRender();
  }

  // ---- scrolling / selection ------------------------------------------------

  private get rowCount(): number {
    return this.grouped ? this.visualRows().length : this.data.length;
  }

  public override getAccessibleNode(): AccessibleNode | null {
    if (!this.visible) return null;
    const state: string[] = [];
    if (this.focused) state.push("focused");
    if (this.isDisabled()) state.push("disabled");
    state.push(`${this.rowCount} row${this.rowCount === 1 ? "" : "s"}`);
    state.push(`${this.columns.length} column${this.columns.length === 1 ? "" : "s"}`);

    let label = "";
    let value: string | undefined;
    if (this.selectedIndex >= 0) {
      value = String(this.selectedIndex + 1);
      const sel = this.rowAtView(this.selectedIndex);
      if (sel) {
        const first = this.columns[0];
        label = first ? this.cellTextFor(first, sel.row, sel.rowIndex) : "";
      }
    }

    return { role: "table", label, value, state };
  }

  private maxScrollTop(visibleRows: number): number {
    return maxRowScrollTop(this.rowCount, visibleRows);
  }

  private ensureVisible(viewIdx: number): void {
    const vis = this.lastVisibleRows || 1;
    if (viewIdx < this.scrollTop) this.scrollTop = viewIdx;
    else if (viewIdx >= this.scrollTop + vis) this.scrollTop = viewIdx - vis + 1;
    this.scrollTop = Math.max(0, this.scrollTop);
  }

  private moveSelection(delta: number): void {
    if (this.rowCount === 0) return;
    const dir = delta > 0 ? 1 : -1;
    const start = this.selectedIndex < 0 ? (dir > 0 ? -1 : this.rowCount) : this.selectedIndex;
    let next = Math.max(0, Math.min(this.rowCount - 1, start + delta));
    if (this.grouped) {
      // Skip header rows in the travel direction; fall back inward at an edge.
      while (next >= 0 && next < this.rowCount && this.headerAtView(next)) next += dir;
      if (next < 0 || next >= this.rowCount) {
        next = Math.max(0, Math.min(this.rowCount - 1, start + delta));
        while (next >= 0 && next < this.rowCount && this.headerAtView(next)) next -= dir;
      }
      if (next < 0 || next >= this.rowCount || this.headerAtView(next)) return;
    }
    this.selectedIndex = next;
    this.ensureVisible(next);
    const sel = this.rowAtView(next);
    if (sel) this.onSelect?.(sel.row, next);
    this.requestRender();
  }

  public override handleScroll(ev: any): void {
    super.handleScroll(ev);
    if (ev.handled) return;
    const next = wheelScrollTop(ev.type, this.scrollTop, this.maxScrollTop(this.lastVisibleRows));
    if (next !== null) {
      this.scrollTop = next;
      ev.handled = true;
      this.requestRender();
    }
  }

  public override handleKey(ev: any): void {
    super.handleKey(ev);
    if (ev.handled) return;

    const name = ev.name || ev.key;
    let handled = true;
    switch (name) {
      case "down":
        this.moveSelection(1);
        break;
      case "up":
        this.moveSelection(-1);
        break;
      case "pagedown":
        this.moveSelection(Math.max(1, this.lastVisibleRows - 1));
        break;
      case "pageup":
        this.moveSelection(-Math.max(1, this.lastVisibleRows - 1));
        break;
      case "home":
        this.moveSelection(-this.rowCount);
        break;
      case "end":
        this.moveSelection(this.rowCount);
        break;
      case "left":
        this.scrollLeft = Math.max(0, this.scrollLeft - 1);
        break;
      case "right": {
        const maxLeft = Math.max(0, this.lastContentWidth - this.bodyWidth());
        this.scrollLeft = Math.min(maxLeft, this.scrollLeft + 1);
        break;
      }
      case "enter":
      case "space":
        if (this.selectedIndex >= 0 && this.onActivate) {
          const sel = this.rowAtView(this.selectedIndex);
          if (sel) this.onActivate(sel.row, this.selectedIndex);
        }
        break;
      default:
        handled = false;
    }
    if (handled) {
      ev.handled = true;
      this.requestRender();
    }
  }

  public override handleMouse(ev: any): void {
    super.handleMouse(ev);
    if (ev.handled) return;

    // Scrollbar drag/release take priority; otherwise drag/release drive body
    // text selection (copy-on-release), routed to us as the drag target.
    if (ev.type === "release") {
      if (this.draggingScrollbar) {
        this.draggingScrollbar = false;
        ev.handled = true;
        return;
      }
      handleReadonlySelectionMouse(this, ev);
      return;
    }
    if (ev.type === "drag") {
      if (this.draggingScrollbar) {
        this.scrollToTrackY(ev.y);
        ev.handled = true;
      } else {
        handleReadonlySelectionMouse(this, ev);
      }
      return;
    }

    if (ev.type !== "press" || ev.button !== "left") return;

    const content = this.getContentRect();
    if (ev.x < content.x || ev.x >= content.right) return;

    // Scrollbar press -> jump + begin drag.
    if (
      this.rowCount > this.lastVisibleRows &&
      ev.x === content.right - 1 &&
      ev.y >= this.lastBodyTop
    ) {
      this.draggingScrollbar = true;
      this.scrollToTrackY(ev.y);
      ev.handled = true;
      return;
    }

    // Header click -> sort
    if (this.showHeader && ev.y === content.y) {
      const col = this.columnAtX(ev.x);
      if (col?.sortable) {
        this.toggleSort(col.key);
        ev.handled = true;
      }
      return;
    }

    // Body press: anchor a text selection (so a following drag can copy the
    // rendered cells) in addition to selecting the row on click.
    handleReadonlySelectionMouse(this, ev);

    // Body click -> select
    const rowOffset = Math.floor((ev.y - this.lastBodyTop) / this.rowHeight);
    if (rowOffset < 0) return;
    const viewIdx = this.scrollTop + rowOffset;
    if (viewIdx < 0 || viewIdx >= this.rowCount) return;

    // A click on a group header toggles its collapse; nothing selectable there.
    const header = this.headerAtView(viewIdx);
    if (header) {
      this.toggleGroup(header.id);
      ev.handled = true;
      return;
    }

    const sel = this.rowAtView(viewIdx);
    if (sel) {
      this.selectedIndex = viewIdx;
      this.onSelect?.(sel.row, viewIdx);

      // Double-click on the same row -> activate.
      const now = Date.now();
      const isDouble =
        viewIdx === this.lastClickIndex && now - this.lastClickAt < TableWidget.DOUBLE_CLICK_MS;
      this.lastClickIndex = viewIdx;
      this.lastClickAt = now;
      if (isDouble) {
        this.lastClickIndex = -1;
        this.onActivate?.(sel.row, viewIdx);
      }

      ev.handled = true;
      this.requestRender();
    }
  }

  /** The padded text of one body row (columns joined), the selectable value. */
  private rowLineText(dataIndex: number, widths: number[]): string {
    return this.rowLineTextFor(this.data[dataIndex], dataIndex, widths);
  }

  /** {@link rowLineText} for an explicit row (flat or grouped). */
  private rowLineTextFor(row: Row, rowIndex: number, widths: number[]): string {
    return this.columns
      .map((col, i) =>
        // Rich cells are blanked only in flat mode (their widget paints there);
        // grouped tables are text-only, so render the cell text instead.
        !this.grouped && this.isRich(col)
          ? " ".repeat(widths[i])
          : fitCell(this.cellTextFor(col, row, rowIndex), widths[i], col.align),
      )
      .join(" ".repeat(GAP));
  }

  /** The `▾ Title  (n)` text of a group header row. */
  private groupHeaderText(header: Extract<GroupedRow<Row>, { kind: "header" }>): string {
    const caret = header.collapsed ? "▸" : "▾";
    return `${caret} ${header.title}  (${header.count})`;
  }

  /** Every body row as a selectable line (view order), for full-range copy. */
  public selectableLines(): string[] {
    const widths = this.lastColWidths;
    if (widths.length === 0) return [];
    if (this.grouped) {
      return this.visualRows().map((r) =>
        r.kind === "header"
          ? this.groupHeaderText(r)
          : this.rowLineTextFor(r.item, r.itemIndex, widths),
      );
    }
    return this.viewIndex.map((di) => this.rowLineText(di, widths));
  }

  /** Map a Y within the scrollbar track to a scroll position. */
  private scrollToTrackY(y: number): void {
    const v = this.lastVisibleRows; // one track cell per visible row
    const next = trackYToScrollTop(y, this.lastBodyTop, v, this.maxScrollTop(v));
    if (next === null) return;
    this.scrollTop = next;
    this.requestRender();
  }

  private columnAtX(screenX: number): TableColumn<Row> | undefined {
    const content = this.getContentRect();
    let x = content.x - this.scrollLeft;
    for (let i = 0; i < this.columns.length; i++) {
      const w = this.lastColWidths[i] ?? 0;
      if (screenX >= x && screenX < x + w) return this.columns[i];
      x += w + GAP;
    }
    return undefined;
  }

  // ---- layout ---------------------------------------------------------------

  private isRich(col: TableColumn<Row>): boolean {
    return typeof col.render === "function";
  }

  /** Screen X of column `colIndex`'s left edge (accounts for horizontal scroll). */
  private columnX(originX: number, colWidths: number[], colIndex: number): number {
    let x = originX - this.scrollLeft;
    for (let i = 0; i < colIndex; i++) x += colWidths[i] + GAP;
    return x;
  }

  /**
   * Resolve viewport geometry for the current frame and cache the parts that
   * event handlers need. Idempotent, so it can run in both the layout and
   * render passes. Returns `null` when there is no room to draw.
   */
  private computeMetrics(): {
    first: number;
    last: number;
    bodyTop: number;
    visibleRows: number;
    colWidths: number[];
    bodyW: number;
    content: ReturnType<Widget["getContentRect"]>;
  } | null {
    this.ensureViewIndex();
    const content = this.getContentRect();
    if (content.width <= 0 || content.height <= 0) return null;

    const headerH = this.headerHeight;
    const bodyTop = content.y + headerH;
    const bodyHeight = content.height - headerH;
    const visibleRows = Math.max(0, Math.floor(bodyHeight / this.rowHeight));

    this.lastVisibleRows = visibleRows;
    this.lastBodyTop = bodyTop;
    this.scrollTop = Math.max(0, Math.min(this.scrollTop, this.maxScrollTop(visibleRows)));

    const first = this.scrollTop;
    const last = Math.min(this.rowCount, first + visibleRows);
    const sampleRows: { row: Row; rowIndex: number }[] = [];
    for (let v = first; v < last; v++) {
      const sel = this.rowAtView(v);
      if (sel) sampleRows.push(sel);
    }

    const bodyW = this.bodyWidth();
    const colWidths = this.resolveColumnWidths(bodyW, sampleRows);
    this.lastColWidths = colWidths;
    this.lastContentWidth =
      colWidths.reduce((s, w) => s + w, 0) + Math.max(0, this.columns.length - 1) * GAP;
    this.scrollLeft = Math.max(
      0,
      Math.min(this.scrollLeft, Math.max(0, this.lastContentWidth - bodyW)),
    );

    this.maybeEmitViewport(first, last);
    return { first, last, bodyTop, visibleRows, colWidths, bodyW, content };
  }

  private maybeEmitViewport(first: number, last: number): void {
    if (!this.onViewportChange || this.grouped) return; // grouped = text-only, no rich cells
    const dataIndices: number[] = [];
    for (let v = first; v < last; v++) dataIndices.push(this.viewIndex[v]);
    const sig = `${first}:${dataIndices.join(",")}`;
    if (sig === this.lastViewportSig) return;
    this.lastViewportSig = sig;
    this.onViewportChange({ first, dataIndices });
  }

  /**
   * Position `ztui-table-cell` children into their row/column slots. Invoked by
   * the App layout pass (returns true to take over child layout). Cells outside
   * the visible window are hidden. Returns false when there are no cell children
   * so a text-only table uses the default layout path.
   */
  public layoutChildren(): boolean {
    const cells: TableCellWidget[] = [];
    for (const child of this.children) {
      if (child instanceof TableCellWidget) cells.push(child);
    }
    if (cells.length === 0) return false;

    // Grouped mode is text-only: hide any rich cells rather than positioning
    // them against an interleaved-header row layout they don't account for.
    if (this.grouped) {
      for (const cell of cells) cell.visible = false;
      return true;
    }

    const m = this.computeMetrics();
    for (const cell of cells) {
      const colIndex = this.columns.findIndex((c) => c.key === cell.colKey);
      const inWindow =
        m !== null && colIndex >= 0 && cell.viewRow >= m.first && cell.viewRow < m.last;
      if (!inWindow || !m) {
        cell.visible = false;
        continue;
      }
      cell.visible = true;
      const x = this.columnX(m.content.x, m.colWidths, colIndex);
      const y = m.bodyTop + (cell.viewRow - m.first) * this.rowHeight;
      cell.region = new Region(new Offset(x, y), new Size(m.colWidths[colIndex], this.rowHeight));
      // Make the cell (and its content, via findResolvedBackground) inherit the
      // selection background so the highlight bar has no gap at this column.
      const selBg =
        cell.viewRow === this.selectedIndex ? this.resolvedSelectedBackground() : undefined;
      cell.computedStyle = { ...cell.computedStyle, background: selBg };
    }
    return true;
  }

  private bodyWidth(): number {
    const content = this.getContentRect();
    const needScrollbar = this.rowCount > this.lastVisibleRows;
    return Math.max(0, content.width - (needScrollbar ? 1 : 0));
  }

  /** Resolve per-column cell widths to fit `avail`, given a sample of rows. */
  private resolveColumnWidths(
    avail: number,
    sampleRows: { row: Row; rowIndex: number }[],
  ): number[] {
    const n = this.columns.length;
    const widths = new Array<number>(n).fill(0);
    const frParts: Array<{ i: number; fr: number }> = [];
    let usedFixed = 0;

    for (let i = 0; i < n; i++) {
      const col = this.columns[i];
      const def = col.width;
      if (typeof def === "number") {
        widths[i] = def;
      } else if (typeof def === "string" && def.endsWith("fr")) {
        const fr = Number.parseFloat(def) || 1;
        frParts.push({ i, fr });
        continue; // resolved after fixed/auto
      } else {
        // auto (also the default): widest of header + sampled cells
        let cw = stringWidth(col.header) + (col.sortable ? 2 : 0);
        for (const { row, rowIndex } of sampleRows) {
          cw = Math.max(cw, stringWidth(this.cellTextFor(col, row, rowIndex)));
        }
        widths[i] = cw;
      }
      widths[i] = this.clampWidth(col, widths[i]);
      usedFixed += widths[i];
    }

    const gaps = n > 0 ? (n - 1) * GAP : 0;
    if (frParts.length > 0) {
      const frTotal = frParts.reduce((s, p) => s + p.fr, 0);
      const remaining = Math.max(0, avail - usedFixed - gaps);
      for (const { i, fr } of frParts) {
        widths[i] = this.clampWidth(
          this.columns[i],
          Math.max(1, Math.floor((remaining * fr) / frTotal)),
        );
      }
    }
    return widths;
  }

  private clampWidth(col: TableColumn<Row>, w: number): number {
    let out = w;
    if (col.minWidth !== undefined) out = Math.max(out, col.minWidth);
    if (col.maxWidth !== undefined) out = Math.min(out, col.maxWidth);
    return Math.max(0, out);
  }

  // ---- rendering ------------------------------------------------------------

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;

    // Draw background + border via the base, but hold off on children so the
    // self-rendered row text lands first and the cell widgets paint on top.
    this.suppressChildren = true;
    super.render(buffer);
    this.suppressChildren = false;

    const m = this.computeMetrics();
    if (!m) return;
    const { first, last, bodyTop, visibleRows, colWidths, bodyW, content } = m;

    buffer.pushClip(new Region(new Offset(content.x, content.y), new Size(bodyW, content.height)));

    if (this.showHeader) {
      this.renderHeader(buffer, content.x, content.y, colWidths, bodyW);
    }

    for (let v = first; v < last; v++) {
      const y = bodyTop + (v - first) * this.rowHeight;
      const header = this.headerAtView(v);
      let lineText: string;
      if (header) {
        this.renderGroupHeader(buffer, content.x, y, header, bodyW);
        lineText = this.groupHeaderText(header);
      } else {
        const sel = this.rowAtView(v);
        if (!sel) continue;
        this.renderRow(
          buffer,
          content.x,
          y,
          sel.row,
          sel.rowIndex,
          colWidths,
          bodyW,
          v === this.selectedIndex,
        );
        lineText = this.rowLineTextFor(sel.row, sel.rowIndex, colWidths);
      }
      // Register the row text (honoring horizontal scroll) as selectable content.
      if (this.selectable) {
        const cols = runCols(lineText).slice(this.scrollLeft, this.scrollLeft + bodyW);
        if (cols.length > 0) {
          App.instance?.selection.addRun({ widget: this, line: v, y, x: content.x, cols });
        }
      }
    }

    buffer.popClip();

    // Widget-bearing cells (column.render) paint over the text grid.
    this.renderChildren(buffer);

    // Fade the body's top/bottom edge (below the fixed header) when rows are
    // scrolled out of view — before the scrollbar so the bar stays crisp.
    fadeScrollEdges(
      buffer,
      new Region(new Offset(content.x, bodyTop), new Size(content.width, content.bottom - bodyTop)),
      first > 0,
      last < this.rowCount,
      this.findResolvedBackground(),
    );

    this.renderScrollbar(
      buffer,
      content,
      this.headerHeight,
      content.height - this.headerHeight,
      visibleRows,
    );
  }

  public override renderChildren(buffer: ScreenBuffer): void {
    if (this.suppressChildren) return;
    const content = this.getContentRect();
    const bodyTop = content.y + this.headerHeight;
    buffer.pushClip(
      new Region(
        new Offset(content.x, bodyTop),
        new Size(this.bodyWidth(), Math.max(0, content.height - this.headerHeight)),
      ),
    );
    super.renderChildren(buffer);
    buffer.popClip();
  }

  private baseStyle(extra: Partial<ConstructorParameters<typeof Style>[0]> = {}): Style {
    // cachedStyle (base Widget) memoizes across frames: a table cycles a small fixed
    // set of variants (normal/selected/header-bold/group-bold/-dim), so each row
    // reuses one Style instance and hits the render diff's identity fast path.
    return this.cachedStyle({
      color: this.computedStyle.color || "default",
      background: this.findResolvedBackground(),
      ...extra,
    });
  }

  private renderHeader(
    buffer: ScreenBuffer,
    originX: number,
    y: number,
    widths: number[],
    bodyW: number,
  ): void {
    const sort = this.sort;
    const cells = this.columns.map((col, i) => {
      let label = col.header;
      if (sort && sort.key === col.key) label += sort.direction === "asc" ? " ▲" : " ▼";
      return fitCell(label, widths[i], col.align);
    });
    const line = padTo(cells.join(" ".repeat(GAP)), Math.max(bodyW, this.lastContentWidth));
    // Bold by default; caller-supplied headerStyle fields take precedence.
    const seg = new Segment(line, this.baseStyle({ bold: true, ...this.headerStyle }));
    buffer.drawSegment(originX - this.scrollLeft, y, seg);
  }

  private renderRow(
    buffer: ScreenBuffer,
    originX: number,
    y: number,
    row: Row,
    rowIndex: number,
    widths: number[],
    bodyW: number,
    selected: boolean,
  ): void {
    const cells = this.columns.map((col, i) =>
      // Rich columns are drawn by their cell widget (flat mode only); reserve a
      // blank cell so the row background/selection highlight fills the slot.
      !this.grouped && this.isRich(col)
        ? " ".repeat(widths[i])
        : fitCell(this.cellTextFor(col, row, rowIndex), widths[i], col.align),
    );
    const line = padTo(cells.join(" ".repeat(GAP)), Math.max(bodyW, this.lastContentWidth));
    // Selection uses an explicit background (not reverse) so widget-bearing
    // cells can inherit it and the highlight bar stays seamless.
    const seg = new Segment(
      line,
      this.baseStyle(selected ? { background: this.resolvedSelectedBackground() } : {}),
    );
    buffer.drawSegment(originX - this.scrollLeft, y, seg);
  }

  /** A group title row, spanning the full body width (bold title + dim count). */
  private renderGroupHeader(
    buffer: ScreenBuffer,
    originX: number,
    y: number,
    header: Extract<GroupedRow<Row>, { kind: "header" }>,
    bodyW: number,
  ): void {
    const text = this.groupHeaderText(header);
    const line = padTo(text, Math.max(bodyW, this.lastContentWidth));
    buffer.drawSegment(
      originX - this.scrollLeft,
      y,
      new Segment(line, this.baseStyle({ bold: true })),
    );
    // Dim the trailing `(count)` so it reads as secondary to the title.
    const suffix = `(${header.count})`;
    const at = stringWidth(text) - stringWidth(suffix);
    buffer.drawSegment(
      originX - this.scrollLeft + at,
      y,
      new Segment(suffix, this.baseStyle({ bold: true, dim: true })),
    );
  }

  private renderScrollbar(
    buffer: ScreenBuffer,
    content: ReturnType<Widget["getContentRect"]>,
    headerH: number,
    bodyHeight: number,
    visibleRows: number,
  ): void {
    if (this.rowCount <= visibleRows || bodyHeight <= 0) return;
    const trackTop = content.y + headerH;
    const trackH = bodyHeight;
    const thumbH = Math.max(1, Math.round((visibleRows / this.rowCount) * trackH));
    const maxScroll = this.maxScrollTop(visibleRows);
    const ratio = maxScroll > 0 ? this.scrollTop / maxScroll : 0;
    const thumbStart = trackTop + Math.round(ratio * (trackH - thumbH));
    const x = content.right - 1;
    const style = this.baseStyle({
      color: this.computedStyle.borderColor || this.computedStyle.color,
    });
    const track = scrollbarTrackStyle(this);
    for (let yy = trackTop; yy < trackTop + trackH; yy++) {
      const isThumb = yy >= thumbStart && yy < thumbStart + thumbH;
      if (isThumb) buffer.setCell(x, yy, "█", style);
      else buffer.setCell(x, yy, " ", track);
    }
  }
}

/** Pads or trims `text` to exactly `width` display cells, respecting alignment. */
export function fitCell(
  text: string,
  width: number,
  align: "left" | "center" | "right" = "left",
): string {
  if (width <= 0) return "";
  const w = stringWidth(text);
  if (w === width) return text;
  if (w < width) {
    const pad = width - w;
    if (align === "right") return " ".repeat(pad) + text;
    if (align === "center") {
      const l = Math.floor(pad / 2);
      return " ".repeat(l) + text + " ".repeat(pad - l);
    }
    return text + " ".repeat(pad);
  }
  // Truncate with an ellipsis.
  if (width === 1) return "…";
  const limit = width - 1;
  let out = "";
  let acc = 0;
  for (const ch of text) {
    const cw = charWidth(ch);
    if (acc + cw > limit) break;
    out += ch;
    acc += cw;
  }
  out += "…";
  const ow = stringWidth(out);
  if (ow < width) out += " ".repeat(width - ow);
  return out;
}

function padTo(text: string, width: number): string {
  const w = stringWidth(text);
  return w >= width ? text : text + " ".repeat(width - w);
}

/**
 * A single widget-bearing table cell. Created by `<Table>` only for visible
 * rows of `column.render` columns; the owning {@link TableWidget} positions it
 * into its row/column slot during layout. Transparent so the row's background
 * and selection highlight show through behind the rendered content.
 */
export class TableCellWidget extends Widget {
  /** Row index in display order this cell belongs to. */
  public viewRow = -1;
  /** Key of the column this cell belongs to. */
  public colKey = "";

  constructor() {
    super("table-cell");
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;
    this.renderChildren(buffer);
  }
}
