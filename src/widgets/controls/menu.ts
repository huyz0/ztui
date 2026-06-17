import { App } from "../../core/app.ts";
import { OverlayRootWidget } from "../../dom/overlay.ts";
import { Screen } from "../../dom/screen.ts";
import { Widget } from "../../dom/widget.ts";
import type { KeyEvent, MouseEvent } from "../../driver/driver.ts";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";

/** Chevron drawn on rows that open a submenu. */
const SUBMENU_GLYPH = "▸";

/**
 * One row in a {@link MenuListWidget}. An action row has a `label`; a row with
 * `separator: true` is a non-interactive divider (its other fields are ignored).
 * A row with a `submenu` opens a nested menu instead of firing `onSelect`.
 */
export interface MenuItem {
  /** Action text. Omit only when `separator` is set. */
  label?: string;
  /** Right-aligned hint, typically a shortcut ("Ctrl+C", "⌘V"). Ignored when `submenu` is set. */
  shortcut?: string;
  /** Leading glyph drawn before the label (one or two cells). */
  icon?: string;
  /** Dim and unselectable (skipped by keyboard nav and clicks). */
  disabled?: boolean;
  /** Draw in the theme `$error` colour — for destructive actions. */
  danger?: boolean;
  /** Render as a horizontal divider instead of an action row. */
  separator?: boolean;
  /** Nested rows; the row shows a `▸` and opens this menu to the side instead of selecting. */
  submenu?: MenuItem[];
  /** Opaque payload handed back via `onSelect` (defaults to the row index). */
  value?: unknown;
}

/**
 * A vertical menu of actions: keyboard- and mouse-navigable, with optional
 * per-row icons, right-aligned shortcut hints, disabled and destructive
 * (`danger`) styling, `separator` dividers, and nested `submenu`s.
 *
 * It is the content of {@link ContextMenu} (which floats it on an overlay layer
 * at a point), but works standalone anywhere a focusable action list is needed.
 * Selecting a leaf row fires `onSelect(item, index)`; a row with a `submenu`
 * opens a nested menu (→ / Enter / click / hover) placed beside the row via the
 * overlay placement engine, with ← closing it. Esc is left unhandled so an
 * enclosing overlay layer's `closeOnEscape` dismisses the whole menu.
 */
export class MenuListWidget extends Widget {
  protected override defaultCursor() {
    return "pointer" as const;
  }

  private _items: MenuItem[] = [];
  /** Index of the highlighted row (always a selectable row, or 0 when none). */
  public highlightedIndex = 0;
  /** Fired when a selectable leaf row is chosen by Enter/Space or a click. */
  public declare onSelect?: (item: MenuItem, index: number) => void;
  /** Nesting depth (0 = root); drives the submenu overlay z-order. */
  public depth = 0;
  /** The menu this one was opened from, if it is a submenu. */
  public parentMenu: MenuListWidget | null = null;

  private childRoot: OverlayRootWidget | null = null;
  private childMenu: MenuListWidget | null = null;
  private overlayScreen: Screen | null = null;
  // Index whose submenu is currently open, or -1.
  private openIndex = -1;

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

  private hasSubmenu(i: number): boolean {
    return !!this._items[i]?.submenu?.length;
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
          this.closeSubmenu(); // moving off the parent row closes its submenu
          App.instance?.queueRender("menu:highlight");
        }
        return;
      }
    }
  }

  /** Choose row `i`: open its submenu, or fire `onSelect` for a leaf row. */
  public activate(i: number): void {
    if (!this.isSelectable(i)) return;
    this.highlightedIndex = i;
    if (this.hasSubmenu(i)) {
      this.openSubmenu(i, true);
      return;
    }
    this.onSelect?.(this._items[i], i);
  }

  /** Open the submenu for row `i` beside its row, optionally moving focus into it. */
  private openSubmenu(i: number, focusChild: boolean): void {
    if (!this.hasSubmenu(i)) return;
    this.highlightedIndex = i;
    const screen = this.getScreen();
    if (!screen) return;

    if (this.openIndex === i && this.childMenu) {
      if (focusChild) screen.focusWidget(this.childMenu);
      return;
    }
    this.closeSubmenu();

    const content = this.getContentRect();
    // Anchor to the parent menu's box at this row, so the submenu opens to the
    // right of the box (flipping left near the screen edge) aligned with the row.
    const anchor = new Region(
      new Offset(this.region.x, content.y + i),
      new Size(this.region.width, 1),
    );

    const child = new MenuListWidget();
    child.depth = this.depth + 1;
    child.parentMenu = this;
    child.items = this._items[i].submenu ?? [];
    child.onSelect = (item, idx) => this.onSelect?.(item, idx);

    const root = new OverlayRootWidget();
    root.passThrough = true; // clicks that miss the submenu fall through to close
    root.anchorRect = anchor;
    root.placement = "right";
    // Stack each level above the last so hit-testing reaches the deepest menu first.
    root.style = { ...root.style, zIndex: 1000 + child.depth };
    root.appendChild(child);

    screen.addOverlay(root);
    this.childRoot = root;
    this.childMenu = child;
    this.overlayScreen = screen;
    this.openIndex = i;
    if (focusChild) screen.focusWidget(child);
    App.instance?.queueRender("menu:submenu-open");
  }

  /** Close this menu's open submenu (and, recursively, its descendants). */
  public closeSubmenu(): void {
    if (!this.childRoot) return;
    this.childMenu?.closeSubmenu();
    this.overlayScreen?.removeOverlay(this.childRoot);
    this.childRoot = null;
    this.childMenu = null;
    this.openIndex = -1;
    App.instance?.queueRender("menu:submenu-close");
  }

  /** The owning {@link Screen}, or null when detached. */
  private getScreen(): Screen | null {
    let node = this.parent;
    while (node) {
      if (node instanceof Screen) return node;
      node = node.parent;
    }
    return null;
  }

  public override measure(maxW: number, maxH: number): void {
    const b = this.borderSize;
    const p = this.padding;
    let contentW = 0;
    for (const item of this._items) {
      if (item.separator) continue;
      const icon = item.icon ? stringWidth(item.icon) + 1 : 0;
      const label = stringWidth(item.label ?? "");
      // A submenu chevron or a right-aligned shortcut occupies the trailing edge.
      const trailing = item.submenu?.length
        ? 2 // "▸" + a column of gap
        : item.shortcut
          ? stringWidth(item.shortcut) + 2
          : 0;
      contentW = Math.max(contentW, icon + label + trailing);
    }
    this.measuredWidth = Math.min(maxW, contentW + b.width + p.width);
    this.measuredHeight = Math.min(maxH, this._items.length + b.height + p.height);
  }

  public override wantsTab(): boolean {
    // Keep Tab inside the menu (acts as next/prev) rather than moving app focus.
    return true;
  }

  public override handleKey(ev: KeyEvent): void {
    const name = ev.name || ev.key;
    if (name === "up") {
      this.move(-1);
      ev.handled = true;
    } else if (name === "down") {
      this.move(1);
      ev.handled = true;
    } else if (name === "tab") {
      this.move(ev.shift ? -1 : 1);
      ev.handled = true;
    } else if (name === "home") {
      this.highlightedIndex = this.firstSelectable(0, 1);
      this.closeSubmenu();
      App.instance?.queueRender("menu:highlight");
      ev.handled = true;
    } else if (name === "end") {
      this.highlightedIndex = this.firstSelectable(this._items.length - 1, -1);
      this.closeSubmenu();
      App.instance?.queueRender("menu:highlight");
      ev.handled = true;
    } else if (name === "right") {
      if (this.hasSubmenu(this.highlightedIndex)) {
        this.openSubmenu(this.highlightedIndex, true);
        ev.handled = true;
      }
    } else if (name === "left") {
      // Back out of a submenu: close it on the parent and refocus the parent.
      if (this.parentMenu) {
        const parent = this.parentMenu;
        parent.closeSubmenu();
        this.getScreen()?.focusWidget(parent);
        ev.handled = true;
      }
    } else if (name === "enter" || name === "return" || name === "space" || name === " ") {
      this.activate(this.highlightedIndex);
      ev.handled = true;
    }
    // Escape is deliberately not handled — it bubbles to the overlay layer so
    // `closeOnEscape` can dismiss the whole menu.
  }

  public override handleMouse(ev: MouseEvent): void {
    const rect = this.getContentRect();
    const i = ev.y - rect.y;
    if (ev.type === "move" || ev.type === "drag") {
      if (this.isSelectable(i) && this.highlightedIndex !== i) {
        this.highlightedIndex = i;
        // Hovering a submenu row opens it (without stealing focus); hovering a
        // plain row closes any open submenu.
        if (this.hasSubmenu(i)) this.openSubmenu(i, false);
        else this.closeSubmenu();
        App.instance?.queueRender("menu:hover");
      }
      return;
    }
    if (ev.type === "press" && ev.button === "left") {
      this.activate(i);
      ev.handled = true;
    }
  }

  public override onUnmount(): void {
    this.closeSubmenu();
    super.onUnmount();
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

      if (item.submenu?.length) {
        buffer.setCell(rect.right - 1, y, SUBMENU_GLYPH, rowStyle);
      } else if (item.shortcut) {
        const sw = stringWidth(item.shortcut);
        const scStyle = new Style({
          color: highlighted ? bg : dimmed,
          background: rowBg,
          bold: highlighted,
        });
        buffer.drawSegment(rect.right - sw, y, new Segment(item.shortcut, scStyle), rect);
      }
    }
  }
}
