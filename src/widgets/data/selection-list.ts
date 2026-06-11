import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import type { ListItem } from "./list-view.ts";
import { fitCell } from "./table.ts";

/** Checkbox glyphs per set (unchecked, checked). */
const BOXES = {
  unicode: { off: "☐", on: "☑" },
  ascii: { off: "[ ]", on: "[x]" },
} as const;
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
  public items: ListItem[] = [];
  /** Checked item ids. */
  public value: string[] = [];
  public glyphSet: SelectionGlyphSet = "unicode";
  /** Background painted across the cursor (focused) row. */
  public cursorBackground = "#585b70";
  /** Color for disabled rows and `detail` text. */
  public mutedColor = "#6c7086";
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
    return Math.max(0, this.rowCount - visibleRows);
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
    if (ev.type === "scroll_up") {
      this.scrollTop = Math.max(0, this.scrollTop - 1);
      ev.handled = true;
    } else if (ev.type === "scroll_down") {
      this.scrollTop = Math.min(this.maxScrollTop(this.lastVisibleRows), this.scrollTop + 1);
      ev.handled = true;
    }
    if (ev.handled) this.requestRender();
  }

  public override handleKey(ev: any): void {
    super.handleKey(ev);
    if (ev.handled) return;
    const name = ev.name || ev.key;
    const page = Math.max(1, this.lastVisibleRows - 1);
    let handled = true;
    switch (name) {
      case "down":
        this.moveCursor(1);
        break;
      case "up":
        this.moveCursor(-1);
        break;
      case "pagedown":
        this.moveCursor(page);
        break;
      case "pageup":
        this.moveCursor(-page);
        break;
      case "home":
        this.moveCursor(-this.rowCount);
        break;
      case "end":
        this.moveCursor(this.rowCount);
        break;
      case "space":
      case " ":
      case "enter":
        this.toggleIndex(this.cursor);
        break;
      case "a":
        this.toggleAll();
        break;
      default:
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
    const trackH = this.lastVisibleRows;
    const maxScroll = this.maxScrollTop(trackH);
    if (trackH <= 1 || maxScroll <= 0) return;
    const ratio = Math.max(0, Math.min(1, (y - this.getContentRect().y) / (trackH - 1)));
    this.scrollTop = Math.round(ratio * maxScroll);
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
    const accent =
      this.computedStyle.color ||
      (this.app ?? App.instance)?.cssResolver.resolveVariable(this, "$primary") ||
      "cyan";

    buffer.pushClip(new Region(new Offset(content.x, content.y), new Size(bodyW, content.height)));
    for (let v = first; v < last; v++) {
      const item = this.items[v];
      const checked = selected.has(item.id);
      const y = content.y + (v - first);
      const background = v === this.cursor ? this.cursorBackground : this.findResolvedBackground();
      const color = item.disabled ? this.mutedColor : checked ? accent : baseColor;
      const line = fitCell(this.rowText(item, checked), bodyW, "left");
      buffer.drawSegment(content.x, y, new Segment(line, new Style({ color, background })));
    }
    buffer.popClip();

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
    for (let yy = content.y; yy < content.y + trackH; yy++) {
      const isThumb = yy >= thumbStart && yy < thumbStart + thumbH;
      buffer.setCell(x, yy, isThumb ? "█" : "░", style);
    }
  }
}
