import { Widget } from "../../dom/widget.ts";
import type { KeyEvent, MouseEvent } from "../../driver/driver.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";

/** @internal Disclosure-triangle glyphs per set (collapsed, expanded). */
const MARKERS = {
  unicode: { closed: "▸", open: "▾" },
  ascii: { closed: ">", open: "v" },
} as const;
/** Disclosure-marker glyph set for {@link CollapsibleWidget}. */
export type CollapsibleGlyphSet = keyof typeof MARKERS;

/**
 * A foldable section: a clickable title row with a disclosure triangle, and a
 * body that shows only when expanded. Body content is the widget's children;
 * collapsing hides them (they stay mounted, so their state survives a toggle).
 *
 * The widget reserves the top row for the title via `padding-top: 1` and draws
 * the title there itself, so children lay out in the content area below. It's
 * focusable: Enter/Space toggle, → expands, ← collapses, and a click on the
 * title row toggles. `open` is driven by the prop; toggling fires `onToggle`.
 */
export class CollapsibleWidget extends Widget {
  public title = "";
  public open = false;
  public glyphSet: CollapsibleGlyphSet = "unicode";
  /** Fired with the requested next open state on Enter/Space/arrow/click. */
  public declare onToggle?: (open: boolean) => void;

  constructor() {
    super("collapsible");
    this.focusable = true;
    this.defaultStyle = { layout: "vertical", padding: { top: 1 } };
  }

  private requestToggle(next: boolean): void {
    if (next === this.open) return;
    this.onToggle?.(next);
  }

  public override handleKey(ev: KeyEvent): void {
    super.handleKey(ev);
    if (ev.handled) return;
    const name = (ev as any).name || (ev as any).key;
    if (name === "enter" || name === "space" || name === " ") {
      this.requestToggle(!this.open);
      ev.handled = true;
    } else if (name === "right" && !this.open) {
      this.requestToggle(true);
      ev.handled = true;
    } else if (name === "left" && this.open) {
      this.requestToggle(false);
      ev.handled = true;
    }
  }

  public override handleMouse(ev: MouseEvent): void {
    super.handleMouse(ev);
    if (ev.handled) return;
    if (ev.type === "press" && ev.button === "left") {
      // The title occupies the row reserved by padding-top, above the content.
      const titleY = this.getContentRect().y - 1;
      if (ev.y === titleY) {
        this.requestToggle(!this.open);
        this.app?.activeScreen.focusWidget(this);
        ev.handled = true;
      }
    }
  }

  public override measure(maxW: number, maxH: number): void {
    // Children form the body: visible only when expanded, so a collapsed section
    // measures to just its title row (the padding-top reserves it).
    for (const child of this.children) {
      if (child instanceof Widget) child.visible = this.open;
    }
    super.measure(maxW, maxH);
  }

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer); // background + border + (visible) children

    const content = this.getContentRect();
    const titleY = content.y - 1; // the padding-top row
    if (titleY < this.region.y) return;

    const marker = MARKERS[this.glyphSet][this.open ? "open" : "closed"];
    const fg = this.computedStyle.color || "default";
    const accent = this.computedStyle.borderColor || "$primary";

    const markerStyle = new Style({ color: accent, background: this.findResolvedBackground() });
    const titleStyle = new Style({
      color: fg,
      background: this.findResolvedBackground(),
      bold: true,
      underline: this.focused, // focus affordance
    });

    // The title row is above the content rect, so clip to the client rect
    // (which spans the border/padding area) rather than the content rect.
    const clip = this.getClientRect();
    buffer.drawSegment(content.x, titleY, new Segment(`${marker} `, markerStyle), clip);
    const tx = content.x + stringWidth(`${marker} `);
    buffer.drawSegment(tx, titleY, new Segment(this.title, titleStyle), clip);
  }
}
