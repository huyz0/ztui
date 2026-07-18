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
import { Segment } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { fitCell } from "./cell-format.ts";
import type { ListItem } from "./list-view.ts";
import { maxRowScrollTop, trackYToScrollTop, wheelScrollTop } from "./row-scroll.ts";

/**
 * @internal Checkbox glyphs per set (unchecked, checked). "unicode" uses "☒"
 * (U+2612), not "☑" (U+2611) — the latter is a real emoji codepoint with a
 * colored, differently-weighted glyph in many terminal fonts, while "☐" has
 * no emoji entry, so the two visibly mismatched. "☒" isn't an emoji
 * codepoint, so it renders in the same plain text style as "☐".
 */
const BOXES = {
  unicode: { off: "☐", on: "☒" },
  ascii: { off: "[ ]", on: "[x]" },
} as const;
/** Checkbox glyph set for {@link SelectionListWidget}. */
export type SelectionGlyphSet = keyof typeof BOXES;

/**
 * A virtualized multi-select list — the "pick which of these to apply" control
 * an agent shows for a set of files, changes, or options. Each row has a
 * checkbox; a cursor (the focused row) moves with the arrows, Space/Enter
 * toggles it, and clicking a row toggles it directly. `a` toggles all enabled
 * rows at once.
 *
 * Selection is the array of checked ids ({@link value}); toggling fires
 * {@link onChange} with the next array (in item order). Like {@link
 * ListViewWidget} the body is virtualized, so it scales to large lists.
 */
export class SelectionListWidget extends Widget {
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
  /** Checked item ids. */
  public value: string[] = [];
  /** Checkbox glyph set. */
  public glyphSet: SelectionGlyphSet = "unicode";
  /** Background painted across the cursor (focused) row. */
  public cursorBackground = "$selectionBg";
  /** Color for disabled rows and `detail` text. */
  public mutedColor = "$dimmed";
  /** Fired with the next checked-id array when the selection changes. */
  public declare onChange?: (selectedIds: string[]) => void;

  private cursor = 0;
  private scrollTop = 0;
  private lastVisibleRows = 0;
  private draggingScrollbar = false;

  constructor() {
    super("selection-list");
    this.focusable = true;
    this.defaultStyle = { width: "100%", height: "100%" };
  }

  private requestRender(): void {
    (this.app ?? App.instance)?.queueRender();
  }

  private get rowCount(): number {
    return this.items.length;
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

  /** Move the cursor by `delta`, skipping disabled rows. */
  private moveCursor(delta: number): void {
    if (this.rowCount === 0 || delta === 0) return;
    const dir = delta > 0 ? 1 : -1;
    let target = Math.max(0, Math.min(this.rowCount - 1, this.cursor + delta));
    while (target >= 0 && target < this.rowCount && this.items[target].disabled) target += dir;
    if (target < 0 || target >= this.rowCount) {
      target = Math.max(0, Math.min(this.rowCount - 1, this.cursor + delta));
      while (target >= 0 && target < this.rowCount && this.items[target].disabled) target -= dir;
    }
    if (target < 0 || target >= this.rowCount || this.items[target].disabled) return;
    this.cursor = target;
    this.ensureVisible(target);
    this.requestRender();
  }

  private emit(set: Set<string>): void {
    // Report ids in item order for a stable result.
    this.onChange?.(this.items.filter((it) => set.has(it.id)).map((it) => it.id));
  }

  private toggleIndex(index: number): void {
    const item = this.items[index];
    if (!item || item.disabled) return;
    const set = new Set(this.value);
    if (set.has(item.id)) set.delete(item.id);
    else set.add(item.id);
    this.emit(set);
  }

  /** Toggle all enabled rows: select all when any are unchecked, else clear. */
  private toggleAll(): void {
    const enabled = this.items.filter((it) => !it.disabled);
    if (enabled.length === 0) return;
    const set = new Set(this.value);
    const allOn = enabled.every((it) => set.has(it.id));
    for (const it of enabled) {
      if (allOn) set.delete(it.id);
      else set.add(it.id);
    }
    this.emit(set);
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
    const delta = selectionDeltaForKey(name, this.lastVisibleRows, this.rowCount);
    let handled = true;
    if (delta !== null) {
      this.moveCursor(delta);
    } else if (name === "space" || name === " " || name === "enter") {
      this.toggleIndex(this.cursor);
    } else if (name === "a") {
      this.toggleAll();
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

    const index = this.scrollTop + (ev.y - content.y);
    if (index < 0 || index >= this.rowCount) return;
    ev.handled = true;
    if (this.items[index].disabled) return;
    this.cursor = index;
    this.toggleIndex(index);
  }

  private scrollToTrackY(y: number): void {
    const v = this.lastVisibleRows;
    const next = trackYToScrollTop(y, this.getContentRect().y, v, this.maxScrollTop(v));
    if (next === null) return;
    this.scrollTop = next;
    this.requestRender();
  }

  private rowText(item: ListItem, checked: boolean): string {
    const box = BOXES[this.glyphSet][checked ? "on" : "off"];
    const icon = item.icon ? `${item.icon} ` : "";
    const detail = item.detail ? `  ${item.detail}` : "";
    return `${box} ${icon}${item.label}${detail}`;
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;
    super.render(buffer);

    const content = this.getContentRect();
    if (content.width <= 0 || content.height <= 0) return;

    const visibleRows = Math.max(0, Math.floor(content.height));
    this.lastVisibleRows = visibleRows;
    this.cursor = Math.max(0, Math.min(this.cursor, Math.max(0, this.rowCount - 1)));
    this.scrollTop = Math.max(0, Math.min(this.scrollTop, this.maxScrollTop(visibleRows)));

    const needScrollbar = this.rowCount > visibleRows;
    const bodyW = Math.max(0, content.width - (needScrollbar ? 1 : 0));
    const first = this.scrollTop;
    const last = Math.min(this.rowCount, first + visibleRows);
    const selected = new Set(this.value);
    const baseColor = this.computedStyle.color || "default";
    const resolver = (this.app ?? App.instance)?.cssResolver;
    const accent =
      this.computedStyle.color || resolver?.resolveVariable(this, "$primary") || "#4daafc";
    const cursorBg = resolver?.resolveVariable(this, this.cursorBackground) ?? "#264f78";
    const muted = resolver?.resolveVariable(this, this.mutedColor) ?? "#8a8a8a";

    buffer.pushClip(new Region(new Offset(content.x, content.y), new Size(bodyW, content.height)));
    for (let v = first; v < last; v++) {
      const item = this.items[v];
      const checked = selected.has(item.id);
      const y = content.y + (v - first);
      const background = v === this.cursor ? cursorBg : this.findResolvedBackground();
      const color = item.disabled ? muted : checked ? accent : baseColor;
      const line = fitCell(this.rowText(item, checked), bodyW, "left");
      buffer.drawSegment(content.x, y, new Segment(line, new Style({ color, background })));
    }
    buffer.popClip();

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
    const trackH = content.height;
    const thumbH = Math.max(1, Math.round((visibleRows / this.rowCount) * trackH));
    const maxScroll = this.maxScrollTop(visibleRows);
    const ratio = maxScroll > 0 ? this.scrollTop / maxScroll : 0;
    const thumbStart = content.y + Math.round(ratio * (trackH - thumbH));
    const x = content.right - 1;
    const style = new Style({
      color: this.computedStyle.borderColor || this.computedStyle.color || "default",
      background: this.findResolvedBackground(),
    });
    const track = scrollbarTrackStyle(this);
    for (let yy = content.y; yy < content.y + trackH; yy++) {
      const isThumb = yy >= thumbStart && yy < thumbStart + thumbH;
      if (isThumb) buffer.setCell(x, yy, "█", style);
      else buffer.setCell(x, yy, " ", track);
    }
  }
}
