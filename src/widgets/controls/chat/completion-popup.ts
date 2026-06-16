/**
 * The completion popup for the chat composer's triggers. A full-screen overlay
 * (so it paints above everything and catches outside clicks to dismiss) with a
 * small bordered list anchored at a caret cell. Generic: it renders whatever
 * {@link Completion} rows it is handed and reports selection/dismissal back to
 * the owner through callbacks — it knows nothing about slashes or mentions.
 */
import { App } from "../../../core/app.ts";
import { Widget } from "../../../dom/widget.ts";
import type { ScreenBuffer } from "../../../render/buffer.ts";
import { Segment, stringWidth } from "../../../render/segment.ts";
import { Style } from "../../../render/style.ts";
import type { Completion } from "./types.ts";

const MAX_ROWS = 8;

export class CompletionPopupWidget extends Widget {
  public items: Completion[] = [];
  public selectedIndex = 0;
  /** Top-left anchor (a cell at/under the trigger char). */
  public anchorX = 0;
  public anchorY = 0;
  /** Invoked with the chosen item index. */
  public onChoose?: (index: number) => void;
  /** Invoked when a click lands outside the popup. */
  public declare onDismiss?: () => void;

  constructor() {
    super("chat-completion-popup");
    this.focusable = false;
    this.style = {
      position: "absolute",
      left: 0,
      top: 0,
      width: "100%",
      height: "100%",
      zIndex: 1200,
    };
  }

  /** Cell width of the bordered popup (clamped to the screen). */
  private boxWidth(): number {
    let w = 0;
    for (const it of this.items) {
      const detail = it.detail ? ` ${it.detail}` : "";
      w = Math.max(w, stringWidth(it.label) + stringWidth(detail));
    }
    return Math.min(Math.max(w + 4, 12), 48);
  }

  private boxHeight(): number {
    return Math.min(this.items.length, MAX_ROWS) + 2;
  }

  /** Resolved on-screen rect of the bordered box (after flip-to-fit). */
  public boxRect(): { x: number; y: number; w: number; h: number } {
    const w = this.boxWidth();
    const h = this.boxHeight();
    const screenW = this.region.width;
    const screenH = this.region.height;
    let y = this.anchorY + 1; // below the caret line by default
    if (screenH && y + h > screenH && this.anchorY - h >= 0) y = this.anchorY - h; // flip above
    let x = this.anchorX;
    if (screenW && x + w > screenW) x = Math.max(0, screenW - w);
    return { x, y: Math.max(0, y), w, h };
  }

  public override handleMouse(ev: any): void {
    if (ev.type !== "press" || ev.button !== "left") return;
    const r = this.boxRect();
    const inside = ev.x >= r.x && ev.x < r.x + r.w && ev.y >= r.y && ev.y < r.y + r.h;
    if (inside) {
      const idx = ev.y - r.y - 1; // minus top border
      if (idx >= 0 && idx < this.items.length) this.onChoose?.(idx);
    } else {
      this.onDismiss?.();
    }
    ev.handled = true;
  }

  public override render(buffer: ScreenBuffer): void {
    if (this.items.length === 0) return;
    const r = this.boxRect();
    const resolve = (v: string) => App.instance?.cssResolver.resolveVariable(this, v) || v;
    const bg = resolve("$panel");
    const fg = resolve("$foreground");
    const accent = resolve("$accent");
    const dim = resolve("$dimmed");
    const border = new Style({ color: dim, background: bg });
    const base = new Style({ color: fg, background: bg });

    // Box background + border.
    for (let yy = r.y; yy < r.y + r.h; yy++) {
      for (let xx = r.x; xx < r.x + r.w; xx++) buffer.setCell(xx, yy, " ", base);
    }
    const tl = "╭",
      tr = "╮",
      bl = "╰",
      br = "╯",
      h = "─",
      v = "│";
    buffer.setCell(r.x, r.y, tl, border);
    buffer.setCell(r.x + r.w - 1, r.y, tr, border);
    buffer.setCell(r.x, r.y + r.h - 1, bl, border);
    buffer.setCell(r.x + r.w - 1, r.y + r.h - 1, br, border);
    for (let xx = r.x + 1; xx < r.x + r.w - 1; xx++) {
      buffer.setCell(xx, r.y, h, border);
      buffer.setCell(xx, r.y + r.h - 1, h, border);
    }
    for (let yy = r.y + 1; yy < r.y + r.h - 1; yy++) {
      buffer.setCell(r.x, yy, v, border);
      buffer.setCell(r.x + r.w - 1, yy, v, border);
    }

    // Rows (windowed around the selection).
    const visible = Math.min(this.items.length, MAX_ROWS);
    let top = 0;
    if (this.selectedIndex >= visible) top = this.selectedIndex - visible + 1;
    for (let i = 0; i < visible; i++) {
      const idx = top + i;
      const it = this.items[idx];
      if (!it) break;
      const selected = idx === this.selectedIndex;
      const rowBg = selected ? resolve("$selectionBg") : bg;
      const rowStyle = new Style({ color: fg, background: rowBg });
      const innerW = r.w - 2;
      const y = r.y + 1 + i;
      // Paint row background.
      for (let xx = r.x + 1; xx < r.x + r.w - 1; xx++) buffer.setCell(xx, y, " ", rowStyle);
      buffer.drawSegment(
        r.x + 1,
        y,
        new Segment(` ${it.label}`, rowStyle.merge({ color: selected ? accent : fg })),
      );
      if (it.detail) {
        const detail = `${it.detail} `;
        const dx = r.x + 1 + innerW - stringWidth(detail);
        buffer.drawSegment(
          dx,
          y,
          new Segment(detail, new Style({ color: dim, background: rowBg })),
        );
      }
    }
  }
}
