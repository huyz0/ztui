import { App } from "../../core/app.ts";
import { selectionDeltaForKey } from "../../dom/key-nav.ts";
import { fadeScrollEdges } from "../../dom/scroll-fade.ts";
import { scrollbarTrackStyle } from "../../dom/scrollbar.ts";
import type { AccessibleNode } from "../../dom/widget.ts";
import { Widget } from "../../dom/widget.ts";
import type { PointerShape } from "../../driver/driver.ts";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { maxRowScrollTop, trackYToScrollTop, wheelScrollTop } from "./row-scroll.ts";
import { fitCell } from "./table.ts";

/** A node in a {@link TreeWidget}: id, label, optional children and metadata. */
export interface TreeNode {
  /** Stable identifier (used for selection and expansion state). */
  id: string;
  /** Text shown for the node. */
  label: string;
  /** Glyph rendered before the label (e.g. a file/folder icon). */
  icon?: string;
  /** Child nodes (omit/empty for a leaf). */
  children?: TreeNode[];
  /**
   * Force the node to be treated as expandable even when `children` is not yet
   * loaded (lazy loading). Defaults to "has a non-empty `children` array".
   */
  expandable?: boolean;
}

interface FlatRow {
  node: TreeNode;
  depth: number;
  expandable: boolean;
  expanded: boolean;
}

const INDENT = 2; // cells per depth level

/**
 * A virtualized tree for workspace / file-explorer style navigation.
 *
 * Like {@link TableWidget}, the body is self-rendered: only the rows inside the
 * current viewport window are drawn, and the flattened row list only ever walks
 * *expanded* nodes — collapsed subtrees cost nothing — so it scales to large
 * workspaces.
 *
 * The input is a forest (`data: TreeNode[]`), so a flat list of top-level items
 * needs no synthetic root. A genuine single-root tree can pass `hideRoot` to
 * present the root's children as the top level.
 */
export class TreeWidget extends Widget {
  protected override defaultCursor() {
    return "pointer" as const;
  }

  /** Rows take the `pointer`; the scrollbar gutter keeps the default arrow. */
  public override cursorShapeAt(x: number, y: number): PointerShape | null {
    if (this.rowCount > this.lastVisibleRows) {
      const content = this.getContentRect();
      if (x === content.right - 1 && y >= content.y && y < content.bottom) return null;
    }
    return super.cursorShapeAt(x, y);
  }

  /** Root nodes of the tree. */
  public data: TreeNode[] = [];
  /** Render each root's children as the top level (hide the root nodes). */
  public hideRoot = false;
  /** Height of each row in cells. */
  public rowHeight = 1;
  /** Expanded node ids. Controlled when `onExpandedChange` is set. */
  public expanded: string[] = [];
  /** Selected node id, or null. */
  public selectedId: string | null = null;
  /** Background color painted across the selected row. */
  public selectedBackground = "$selectionBg";
  /** Draw a dotted vertical guide line at each indentation level. */
  public showGuides = false;
  /** Color of the indentation guides. Subtle/muted by default. */
  public guideColor = "$border";

  /** Selection changed (arrow navigation or single click). */
  public declare onSelect?: (node: TreeNode) => void;
  /** Item activated — Enter, Space, or double-click (the "open it" intent). */
  public declare onActivate?: (node: TreeNode) => void;
  /** A node was expanded/collapsed. */
  public declare onToggle?: (node: TreeNode, expanded: boolean) => void;
  /** The set of expanded ids changed. */
  public declare onExpandedChange?: (expanded: string[]) => void;

  // Double-click detection (no driver support; measured here).
  private lastClickIndex = -1;
  private lastClickAt = 0;
  private static readonly DOUBLE_CLICK_MS = 400;

  private scrollTop = 0;
  private scrollLeft = 0;

  private flat: FlatRow[] = [];
  private expandedSet = new Set<string>();
  private lastData: TreeNode[] | null = null;
  private lastExpandedSig = "\0";
  private lastHideRoot = false;

  private lastVisibleRows = 0;
  private lastContentWidth = 0;
  private draggingScrollbar = false;
  // Widest row width seen so far for the current dataset, so scrolling a wide
  // row out of the viewport doesn't shrink the horizontal scroll bound (and
  // snap scrollLeft back) just because it's no longer among the rows sampled
  // this frame. Reset whenever the dataset itself is swapped for a new one.
  private maxRowWSeen = 0;
  private maxRowWFor: TreeNode[] | null = null;

  constructor() {
    super("tree");
    this.focusable = true;
    this.defaultStyle = { width: "100%", height: "100%" };
  }

  // ---- model / flattening ---------------------------------------------------

  private isExpandable(node: TreeNode): boolean {
    return node.expandable ?? (Array.isArray(node.children) && node.children.length > 0);
  }

  private ensureFlat(): void {
    const expSig = this.expanded.join("\0");
    // `lastData` is only ever `this.data` here once a build has actually run
    // for it (it starts `null`, and `invalidate()` resets it to `null`), so
    // this alone is a valid "cache still fresh" signal — checking
    // `flat.length > 0` on top of it wrongly forced a full rebuild on every
    // call whenever the tree legitimately flattens to nothing (empty data, or
    // everything filtered/collapsed away), defeating the memoization for
    // that state.
    if (
      this.lastData === this.data &&
      this.lastExpandedSig === expSig &&
      this.lastHideRoot === this.hideRoot
    ) {
      return;
    }
    this.expandedSet = new Set(this.expanded);
    this.flat = [];
    const roots = this.hideRoot ? this.data.flatMap((r) => r.children ?? []) : this.data;
    const walk = (nodes: TreeNode[], depth: number): void => {
      for (const node of nodes) {
        const expandable = this.isExpandable(node);
        const expanded = expandable && this.expandedSet.has(node.id);
        this.flat.push({ node, depth, expandable, expanded });
        if (expanded && node.children) walk(node.children, depth + 1);
      }
    };
    walk(roots, 0);

    this.lastData = this.data;
    this.lastExpandedSig = expSig;
    this.lastHideRoot = this.hideRoot;
  }

  /** Force a rebuild on the next frame (after data/expansion mutates). */
  private invalidate(): void {
    this.lastData = null;
    this.requestRender();
  }

  private requestRender(): void {
    App.instance?.queueRender();
  }

  private get selectedIndex(): number {
    if (this.selectedId === null) return -1;
    return this.flat.findIndex((r) => r.node.id === this.selectedId);
  }

  // ---- expansion ------------------------------------------------------------

  /** Expand or collapse the node with `id`. */
  public setExpanded(id: string, expanded: boolean): void {
    const has = this.expanded.includes(id);
    if (expanded === has) return;
    if (!expanded && this.selectedId !== null) {
      // Collapsing an ancestor of the current selection would otherwise leave
      // `selectedId` pointing at a row no longer in `flat` (selectedIndex
      // becomes -1), so the next arrow-key press treats it as "nothing
      // selected" and jumps to the very top/bottom of the entire tree
      // instead of landing near where the user's focus logically was.
      // Reselect the collapsed row itself (still visible), mirroring
      // selectParent()'s "step out to the nearest visible ancestor".
      this.ensureFlat();
      const idx = this.flat.findIndex((r) => r.node.id === id);
      if (idx >= 0) {
        const depth = this.flat[idx].depth;
        let end = idx + 1;
        while (end < this.flat.length && this.flat[end].depth > depth) end++;
        const strandsSelection = this.flat
          .slice(idx + 1, end)
          .some((r) => r.node.id === this.selectedId);
        if (strandsSelection) this.selectedId = id;
      }
    }
    const next = expanded ? [...this.expanded, id] : this.expanded.filter((x) => x !== id);
    if (this.onExpandedChange) {
      this.onExpandedChange(next);
    } else {
      this.expanded = next;
    }
    const row = this.flat.find((r) => r.node.id === id);
    if (row) this.onToggle?.(row.node, expanded);
    this.invalidate();
  }

  /** Toggle the expanded state of the node with `id`. */
  public toggle(id: string): void {
    this.setExpanded(id, !this.expanded.includes(id));
  }

  public override getAccessibleNode(): AccessibleNode | null {
    if (!this.visible) return null;
    this.ensureFlat();

    const state: string[] = [];
    if (this.focused) state.push("focused");
    if (this.isDisabled()) state.push("disabled");
    state.push(`${this.rowCount} item${this.rowCount === 1 ? "" : "s"}`);

    const idx = this.selectedIndex;
    let label = "";
    let value: string | undefined;
    if (idx >= 0) {
      const row = this.flat[idx];
      label = row.node.label;
      value = String(idx + 1);
      state.push(`level ${row.depth + 1}`);
      if (row.expandable) state.push(row.expanded ? "expanded" : "collapsed");
    }

    return { role: "tree", label, value, state };
  }

  // ---- scrolling / selection ------------------------------------------------

  private get rowCount(): number {
    return this.flat.length;
  }

  private maxScrollTop(visibleRows: number): number {
    return maxRowScrollTop(this.rowCount, visibleRows);
  }

  private ensureVisible(index: number): void {
    const vis = this.lastVisibleRows || 1;
    if (index < this.scrollTop) this.scrollTop = index;
    else if (index >= this.scrollTop + vis) this.scrollTop = index - vis + 1;
    this.scrollTop = Math.max(0, this.scrollTop);
  }

  private selectIndex(index: number, fireSelect = true): void {
    if (index < 0 || index >= this.rowCount) return;
    this.selectedId = this.flat[index].node.id;
    this.ensureVisible(index);
    if (fireSelect) this.onSelect?.(this.flat[index].node);
    this.requestRender();
  }

  private moveSelection(delta: number): void {
    if (this.rowCount === 0) return;
    const cur = this.selectedIndex;
    const start = cur < 0 ? (delta > 0 ? -1 : this.rowCount) : cur;
    this.selectIndex(Math.max(0, Math.min(this.rowCount - 1, start + delta)));
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
    this.ensureFlat();

    const name = ev.name || ev.key;
    const idx = this.selectedIndex;
    const row = idx >= 0 ? this.flat[idx] : undefined;
    const delta = selectionDeltaForKey(name, this.lastVisibleRows, this.rowCount);
    let handled = true;
    if (delta !== null) {
      this.moveSelection(delta);
      ev.handled = true;
      return;
    }
    switch (name) {
      case "right":
        // Expand a collapsed node, or step into the first child.
        if (row?.expandable && !row.expanded) this.toggle(row.node.id);
        else if (row?.expanded) this.moveSelection(1);
        break;
      case "left":
        // Collapse an expanded node, or step out to the parent.
        if (row?.expandable && row.expanded) this.toggle(row.node.id);
        else if (row) this.selectParent(idx);
        break;
      case "enter":
      case "space":
        // Activate (open). Expandable nodes also toggle, as in a file explorer.
        if (row?.expandable) this.toggle(row.node.id);
        if (row) this.onActivate?.(row.node);
        break;
      default:
        handled = false;
    }
    if (handled) ev.handled = true;
  }

  private selectParent(index: number): void {
    const depth = this.flat[index].depth;
    for (let i = index - 1; i >= 0; i--) {
      if (this.flat[i].depth < depth) {
        this.selectIndex(i);
        return;
      }
    }
  }

  public override handleMouse(ev: any): void {
    super.handleMouse(ev);
    if (ev.handled) return;
    this.ensureFlat();

    if (ev.type === "release") {
      if (this.draggingScrollbar) {
        this.draggingScrollbar = false;
        ev.handled = true;
      }
      return;
    }
    if (ev.type === "drag" && this.draggingScrollbar) {
      this.scrollToTrackY(ev.y);
      ev.handled = true;
      return;
    }
    if (ev.type !== "press" || ev.button !== "left") return;

    const content = this.getContentRect();
    if (ev.x < content.x || ev.x >= content.right || ev.y < content.y) return;

    if (this.rowCount > this.lastVisibleRows && ev.x === content.right - 1) {
      this.draggingScrollbar = true;
      this.scrollToTrackY(ev.y);
      ev.handled = true;
      return;
    }

    const rowOffset = Math.floor((ev.y - content.y) / this.rowHeight);
    const index = this.scrollTop + rowOffset;
    if (index < 0 || index >= this.rowCount) return;
    const row = this.flat[index];

    // Click on the expand/collapse arrow toggles instead of just selecting.
    const arrowX = content.x - this.scrollLeft + row.depth * INDENT;
    if (row.expandable && ev.x >= arrowX && ev.x < arrowX + 1) {
      this.selectedId = row.node.id;
      this.toggle(row.node.id);
      ev.handled = true;
      return;
    }

    // Detect a double-click on the same row -> activate.
    const now = Date.now();
    const isDouble =
      index === this.lastClickIndex && now - this.lastClickAt < TreeWidget.DOUBLE_CLICK_MS;
    this.lastClickIndex = index;
    this.lastClickAt = now;

    this.selectIndex(index);
    if (isDouble) {
      this.lastClickIndex = -1; // a third click starts a fresh pair
      this.onActivate?.(row.node);
    }
    ev.handled = true;
  }

  private scrollToTrackY(y: number): void {
    const v = this.lastVisibleRows;
    const next = trackYToScrollTop(y, this.getContentRect().y, v, this.maxScrollTop(v));
    if (next === null) return;
    this.scrollTop = next;
    this.requestRender();
  }

  // ---- rendering ------------------------------------------------------------

  private bodyWidth(content: Region): number {
    const needScrollbar = this.rowCount > this.lastVisibleRows;
    return Math.max(0, content.width - (needScrollbar ? 1 : 0));
  }

  private rowText(row: FlatRow): string {
    const indent = " ".repeat(row.depth * INDENT);
    const arrow = row.expandable ? (row.expanded ? "▾ " : "▸ ") : "  ";
    const icon = row.node.icon ? `${row.node.icon} ` : "";
    return `${indent}${arrow}${icon}${row.node.label}`;
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;
    super.render(buffer); // background + border

    this.ensureFlat();
    const content = this.getContentRect();
    if (content.width <= 0 || content.height <= 0) return;

    const visibleRows = Math.max(0, Math.floor(content.height / this.rowHeight));
    this.lastVisibleRows = visibleRows;
    this.scrollTop = Math.max(0, Math.min(this.scrollTop, this.maxScrollTop(visibleRows)));

    const first = this.scrollTop;
    const last = Math.min(this.rowCount, first + visibleRows);
    const bodyW = this.bodyWidth(content);

    // Widest visible row drives horizontal scroll bounds. Widened against the
    // running max for this dataset (not just this frame's visible rows) so a
    // wide row scrolling out of view doesn't shrink the bound and snap
    // scrollLeft back.
    if (this.data !== this.maxRowWFor) {
      this.maxRowWFor = this.data;
      this.maxRowWSeen = 0;
    }
    for (let v = first; v < last; v++)
      this.maxRowWSeen = Math.max(this.maxRowWSeen, stringWidth(this.rowText(this.flat[v])));
    this.lastContentWidth = this.maxRowWSeen;
    this.scrollLeft = Math.max(0, Math.min(this.scrollLeft, Math.max(0, this.maxRowWSeen - bodyW)));

    buffer.pushClip(new Region(new Offset(content.x, content.y), new Size(bodyW, content.height)));
    const selIdx = this.selectedIndex;
    const resolver = (this.app ?? App.instance)?.cssResolver;
    const selectedBg = resolver?.resolveVariable(this, this.selectedBackground) ?? "#264f78";
    const guideColor = resolver?.resolveVariable(this, this.guideColor) || "default";
    for (let v = first; v < last; v++) {
      const row = this.flat[v];
      const y = content.y + (v - first) * this.rowHeight;
      const background = v === selIdx ? selectedBg : this.findResolvedBackground();
      const line = fitCell(this.rowText(row), Math.max(bodyW, this.lastContentWidth), "left");
      const seg = new Segment(
        line,
        new Style({ color: this.computedStyle.color || "default", background }),
      );
      buffer.drawSegment(content.x - this.scrollLeft, y, seg);

      // Overlay a dotted vertical guide at each ancestor's indent column. The
      // flattened, expanded order is contiguous per subtree, so per-row guides
      // form one continuous line spanning exactly that subtree.
      if (this.showGuides) {
        const guideStyle = new Style({ color: guideColor, background });
        for (let level = 0; level < row.depth; level++) {
          const gx = content.x - this.scrollLeft + level * INDENT;
          buffer.setCell(gx, y, "┊", guideStyle);
        }
      }
    }
    buffer.popClip();

    fadeScrollEdges(
      buffer,
      content,
      first > 0,
      last < this.rowCount,
      this.findResolvedBackground(),
    );

    this.renderScrollbar(buffer, content, visibleRows);
  }

  private renderScrollbar(buffer: ScreenBuffer, content: Region, visibleRows: number): void {
    if (this.rowCount <= visibleRows || content.height <= 0) return;
    const trackTop = content.y;
    const trackH = content.height;
    const thumbH = Math.max(1, Math.round((visibleRows / this.rowCount) * trackH));
    const maxScroll = this.maxScrollTop(visibleRows);
    const ratio = maxScroll > 0 ? this.scrollTop / maxScroll : 0;
    const thumbStart = trackTop + Math.round(ratio * (trackH - thumbH));
    const x = content.right - 1;
    const style = new Style({
      color: this.computedStyle.borderColor || this.computedStyle.color || "default",
      background: this.findResolvedBackground(),
    });
    const track = scrollbarTrackStyle(this);
    for (let yy = trackTop; yy < trackTop + trackH; yy++) {
      const isThumb = yy >= thumbStart && yy < thumbStart + thumbH;
      if (isThumb) buffer.setCell(x, yy, "█", style);
      else buffer.setCell(x, yy, " ", track);
    }
  }
}
