import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import type { KeyEvent, MouseEvent } from "../../driver/driver.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";

/**
 * One row in a {@link MenuListWidget}. An action row has a `label`; a row with
 * `separator: true` is a non-interactive divider (its other fields are ignored).
 */
export interface MenuItem {
  /** Action text. Omit only when `separator` is set. */
  label?: string;
  /** Right-aligned hint, typically a shortcut ("Ctrl+C", "⌘V"). */
  shortcut?: string;
  /** Leading glyph drawn before the label (one or two cells). */
  icon?: string;
  /** Dim and unselectable (skipped by keyboard nav and clicks). */
  disabled?: boolean;
  /** Draw in the theme `$error` colour — for destructive actions. */
  danger?: boolean;
  /** Render as a horizontal divider instead of an action row. */
  separator?: boolean;
  /** Opaque payload handed back via `onSelect` (defaults to the row index). */
  value?: unknown;
}

/**
 * A vertical menu of actions: keyboard- and mouse-navigable, with optional
 * per-row icons, right-aligned shortcut hints, disabled and destructive
 * (`danger`) styling, and `separator` dividers. It self-sizes to its content.
 *
 * It is the content of {@link ContextMenu} (which floats it on an overlay layer
 * at a point), but works standalone anywhere a focusable action list is needed.
 * Selecting a row fires `onSelect(item, index)`; the host decides what closing
 * means. Esc is intentionally left unhandled so an enclosing overlay layer's
 * `closeOnEscape` can dismiss the menu.
 */
export class MenuListWidget extends Widget {
  private _items: MenuItem[] = [];
  /** Index of the highlighted row (always a selectable row, or 0 when none). */
  public highlightedIndex = 0;
  /** Fired when a selectable row is chosen by Enter/Space or a click. */
  public declare onSelect?: (item: MenuItem, index: number) => void;

  constructor() {
    super("menu-list");
    this.focusable = true;
    // Hover highlights the row under the pointer on hover-capable terminals.
    this.hoverInterest = true;
    this.defaultStyle = {
      border: "rounded",
      background: "$surface",
      color: "$foreground",
      padding: { left: 1, right: 1 },
    };
  }

  /** The menu rows. Setting them re-clamps the highlight to a selectable row. */
  public get items(): MenuItem[] {
    return this._items;
  }
  public set items(v: MenuItem[]) {
    this._items = Array.isArray(v) ? v : [];
    if (!this.isSelectable(this.highlightedIndex)) {
      this.highlightedIndex = this.firstSelectable(0, 1);
    }
  }

  private isSelectable(i: number): boolean {
    const item = this._items[i];
    return !!item && !item.separator && !item.disabled;
  }

  /** First selectable index scanning from `start` in direction `dir`; else 0. */
  private firstSelectable(start: number, dir: 1 | -1): number {
    for (let i = start; i >= 0 && i < this._items.length; i += dir) {
      if (this.isSelectable(i)) return i;
    }
    return 0;
  }

  /** Move the highlight by `dir`, skipping separators/disabled rows, wrapping. */
  private move(dir: 1 | -1): void {
    const n = this._items.length;
    if (n === 0) return;
    for (let step = 1; step <= n; step++) {
      const i = (this.highlightedIndex + dir * step + n * step) % n;
      if (this.isSelectable(i)) {
        if (this.highlightedIndex !== i) {
          this.highlightedIndex = i;
          App.instance?.queueRender("menu:highlight");
        }
        return;
      }
    }
  }

  /** Choose row `i` if it is selectable, firing `onSelect`. */
  public activate(i: number): void {
    if (!this.isSelectable(i)) return;
    this.highlightedIndex = i;
    this.onSelect?.(this._items[i], i);
  }

  public override measure(maxW: number, maxH: number): void {
    const b = this.borderSize;
    const p = this.padding;
    let contentW = 0;
    for (const item of this._items) {
      if (item.separator) continue;
      const icon = item.icon ? stringWidth(item.icon) + 1 : 0;
      const label = stringWidth(item.label ?? "");
      // Shortcut sits right-aligned with at least two columns of gap.
      const shortcut = item.shortcut ? stringWidth(item.shortcut) + 2 : 0;
      contentW = Math.max(contentW, icon + label + shortcut);
    }
    this.measuredWidth = Math.min(maxW, contentW + b.width + p.width);
    this.measuredHeight = Math.min(maxH, this._items.length + b.height + p.height);
  }

  public override handleKey(ev: KeyEvent): void {
    const name = ev.name || ev.key;
    if (name === "up") {
      this.move(-1);
      ev.handled = true;
    } else if (name === "down") {
      this.move(1);
      ev.handled = true;
    } else if (name === "home") {
      this.highlightedIndex = this.firstSelectable(0, 1);
      App.instance?.queueRender("menu:highlight");
      ev.handled = true;
    } else if (name === "end") {
      this.highlightedIndex = this.firstSelectable(this._items.length - 1, -1);
      App.instance?.queueRender("menu:highlight");
      ev.handled = true;
    } else if (name === "enter" || name === "return" || name === "space" || name === " ") {
      this.activate(this.highlightedIndex);
      ev.handled = true;
    }
    // Escape is deliberately not handled — it bubbles to the overlay layer so
    // `closeOnEscape` can dismiss the menu.
  }

  public override handleMouse(ev: MouseEvent): void {
    const rect = this.getContentRect();
    const i = ev.y - rect.y;
    if (ev.type === "move" || ev.type === "drag") {
      if (this.isSelectable(i) && this.highlightedIndex !== i) {
        this.highlightedIndex = i;
        App.instance?.queueRender("menu:hover");
      }
      return;
    }
    if (ev.type === "press" && ev.button === "left") {
      this.activate(i);
      ev.handled = true;
    }
  }

  public override render(buffer: ScreenBuffer): void {
    if (this.computedStyle.border === undefined) this.computedStyle.border = "rounded";
    super.render(buffer);

    const rect = this.getContentRect();
    const app = App.instance;
    const resolve = (v: string, fallback: string) =>
      app?.cssResolver.resolveVariable(this, v) || fallback;
    const fg = this.computedStyle.color || resolve("$foreground", "default");
    const bg = this.findResolvedBackground();
    const accent = resolve("$primary", "#4daafc");
    const dimmed = resolve("$dimmed", "gray");
    const danger = resolve("$error", "red");
    const sepColor = resolve("$border", dimmed);

    for (let i = 0; i < this._items.length; i++) {
      const y = rect.y + i;
      if (y < rect.y || y >= rect.bottom) continue;
      const item = this._items[i];

      if (item.separator) {
        const s = new Style({ color: sepColor, background: bg });
        for (let x = rect.x; x < rect.right; x++) buffer.setCell(x, y, "─", s);
        continue;
      }

      const highlighted = i === this.highlightedIndex && !item.disabled;
      const baseColor = item.disabled ? dimmed : item.danger ? danger : fg;
      const rowBg = highlighted ? accent : bg;
      const rowFg = highlighted ? bg : baseColor;
      const rowStyle = new Style({ color: rowFg, background: rowBg, bold: highlighted });

      // Paint the full row background first so the highlight spans edge to edge.
      for (let x = rect.x; x < rect.right; x++) buffer.setCell(x, y, " ", rowStyle);

      let drawX = rect.x;
      if (item.icon) {
        buffer.drawSegment(drawX, y, new Segment(`${item.icon} `, rowStyle), rect);
        drawX += stringWidth(item.icon) + 1;
      }
      buffer.drawSegment(drawX, y, new Segment(item.label ?? "", rowStyle), rect);

      if (item.shortcut) {
        const sw = stringWidth(item.shortcut);
        const sx = rect.right - sw;
        const scStyle = new Style({
          color: highlighted ? bg : dimmed,
          background: rowBg,
          bold: highlighted,
        });
        buffer.drawSegment(sx, y, new Segment(item.shortcut, scStyle), rect);
      }
    }
  }
}
