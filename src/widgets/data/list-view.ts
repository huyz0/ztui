import { App } from "../../core/app.ts";
import { selectionDeltaForKey } from "../../dom/key-nav.ts";
import { fadeScrollEdges } from "../../dom/scroll-fade.ts";
import { scrollbarTrackStyle } from "../../dom/scrollbar.ts";
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

/** An item in a {@link ListViewWidget} / {@link SelectionListWidget}. */
export interface ListItem {
  /** Stable identifier (used for selection state). */
  id: string;
  /** Primary text. */
  label: string;
  /** Glyph rendered before the label. */
  icon?: string;
  /** Secondary text rendered dimmed after the label. */
  detail?: string;
  /** Skipped by keyboard navigation and not selectable by click. */
  disabled?: boolean;
}

/**
 * A virtualized flat list with single selection.
 *
 * Like {@link TreeWidget}, the body is self-rendered: only the rows inside the
 * current viewport window are drawn, so it scales to very large lists. For
 * hierarchical data use Tree; for columnar data use Table.
 */
export class ListViewWidget extends Widget {
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

  /** Items to display. */
  public items: ListItem[] = [];
  /** Height of each row in cells. */
  public rowHeight = 1;
  /** Selected item id, or null. */
  public selectedId: string | null = null;
  /** Background color painted across the selected row. */
  public selectedBackground = "$selectionBg";
  /** Color used for the disabled rows and the `detail` text. */
  public mutedColor = "$dimmed";

  /** Selection changed (arrow navigation or single click). */
  public declare onSelect?: (item: ListItem) => void;
  /** Item activated — Enter, Space, or double-click (the "open it" intent). */
  public declare onActivate?: (item: ListItem) => void;

  // Double-click detection (no driver support; measured here).
  private lastClickIndex = -1;
  private lastClickAt = 0;
  private static readonly DOUBLE_CLICK_MS = 400;

  private scrollTop = 0;
  private scrollLeft = 0;
  private lastVisibleRows = 0;
  private lastContentWidth = 0;
  private draggingScrollbar = false;

  constructor() {
    super("listview");
    this.focusable = true;
    this.defaultStyle = { width: "100%", height: "100%" };
  }

  private requestRender(): void {
    App.instance?.queueRender();
  }

  private get rowCount(): number {
    return this.items.length;
  }

  private get selectedIndex(): number {
    if (this.selectedId === null) return -1;
    return this.items.findIndex((it) => it.id === this.selectedId);
  }

  // ---- scrolling / selection ------------------------------------------------

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
    const item = this.items[index];
    if (item.disabled) return;
    this.selectedId = item.id;
    this.ensureVisible(index);
    if (fireSelect) this.onSelect?.(item);
    this.requestRender();
  }

  /**
   * Step the selection by `delta`, landing on the nearest enabled row in that
   * direction (disabled rows are skipped; a fully disabled tail is a no-op).
   */
  private moveSelection(delta: number): void {
    if (this.rowCount === 0 || delta === 0) return;
    const cur = this.selectedIndex;
    const dir = delta > 0 ? 1 : -1;
    const start = cur < 0 ? (dir > 0 ? -1 : this.rowCount) : cur;
    let target = Math.max(0, Math.min(this.rowCount - 1, start + delta));
    while (target >= 0 && target < this.rowCount && this.items[target].disabled) target += dir;
    if (target < 0 || target >= this.rowCount) {
      // Walked off the edge: fall back to the nearest enabled row inward.
      target = Math.max(0, Math.min(this.rowCount - 1, start + delta));
      while (target >= 0 && target < this.rowCount && this.items[target].disabled) target -= dir;
    }
    this.selectIndex(target);
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
    const idx = this.selectedIndex;
    const delta = selectionDeltaForKey(name, this.lastVisibleRows, this.rowCount);
    let handled = true;
    if (delta !== null) {
      this.moveSelection(delta);
    } else if (name === "enter" || name === "space") {
      if (idx >= 0) this.onActivate?.(this.items[idx]);
      else handled = false;
    } else {
      handled = false;
    }
    if (handled) ev.handled = true;
  }

  public override handleMouse(ev: any): void {
    super.handleMouse(ev);
    if (ev.handled) return;

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
    if (this.items[index].disabled) {
      ev.handled = true;
      return;
    }

    // Detect a double-click on the same row -> activate.
    const now = Date.now();
    const isDouble =
      index === this.lastClickIndex && now - this.lastClickAt < ListViewWidget.DOUBLE_CLICK_MS;
    this.lastClickIndex = index;
    this.lastClickAt = now;

    this.selectIndex(index);
    if (isDouble) {
      this.lastClickIndex = -1; // a third click starts a fresh pair
      this.onActivate?.(this.items[index]);
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

  private rowText(item: ListItem): string {
    const icon = item.icon ? `${item.icon} ` : "";
    const detail = item.detail ? `  ${item.detail}` : "";
    return `${icon}${item.label}${detail}`;
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;
    super.render(buffer); // background + border

    const content = this.getContentRect();
    if (content.width <= 0 || content.height <= 0) return;

    const visibleRows = Math.max(0, Math.floor(content.height / this.rowHeight));
    this.lastVisibleRows = visibleRows;
    this.scrollTop = Math.max(0, Math.min(this.scrollTop, this.maxScrollTop(visibleRows)));

    const first = this.scrollTop;
    const last = Math.min(this.rowCount, first + visibleRows);
    const bodyW = this.bodyWidth(content);

    // Widest visible row drives horizontal scroll bounds.
    let maxRowW = 0;
    for (let v = first; v < last; v++)
      maxRowW = Math.max(maxRowW, stringWidth(this.rowText(this.items[v])));
    this.lastContentWidth = maxRowW;
    this.scrollLeft = Math.max(0, Math.min(this.scrollLeft, Math.max(0, maxRowW - bodyW)));

    buffer.pushClip(new Region(new Offset(content.x, content.y), new Size(bodyW, content.height)));
    const selIdx = this.selectedIndex;
    const baseColor = this.computedStyle.color || "default";
    const resolver = (this.app ?? App.instance)?.cssResolver;
    const selectedBg = resolver?.resolveVariable(this, this.selectedBackground) ?? "#264f78";
    const muted = resolver?.resolveVariable(this, this.mutedColor) ?? "#8a8a8a";
    for (let v = first; v < last; v++) {
      const item = this.items[v];
      const y = content.y + (v - first) * this.rowHeight;
      const background = v === selIdx ? selectedBg : this.findResolvedBackground();
      const color = item.disabled ? muted : baseColor;
      const line = fitCell(this.rowText(item), Math.max(bodyW, this.lastContentWidth), "left");
      buffer.drawSegment(
        content.x - this.scrollLeft,
        y,
        new Segment(line, new Style({ color, background })),
      );
      // Re-draw the detail suffix dimmed so it reads as secondary text.
      if (item.detail && !item.disabled) {
        const prefixW = stringWidth(this.rowText(item)) - stringWidth(item.detail);
        buffer.drawSegment(
          content.x - this.scrollLeft + prefixW,
          y,
          new Segment(item.detail, new Style({ color: muted, background })),
        );
      }
    }
    buffer.popClip();

    // Fade the top/bottom edge when rows are scrolled out of view (before the
    // scrollbar so the bar stays crisp).
    fadeScrollEdges(
      buffer,
      content,
      this.scrollTop > 0,
      this.scrollTop < this.maxScrollTop(visibleRows),
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
