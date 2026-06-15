import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import type { MouseEvent } from "../../driver/driver.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Style } from "../../render/style.ts";

export type SplitterOrientation = "vertical" | "horizontal";

/**
 * A 1-cell draggable separator used to resize docked regions.
 *
 * - `vertical` draws a `│` column and reports horizontal drag (resizing the
 *   width of a left/right panel).
 * - `horizontal` draws a `─` row and reports vertical drag (resizing the
 *   height of a top/bottom panel).
 *
 * It emits the *incremental* pointer delta along its axis since the previous
 * drag event via `onResize`; the consumer owns the size state and decides the
 * sign (a left panel grows on +dx, a right panel shrinks). The glyph thickens
 * (`┃`/`━`) while hovered or dragging to signal it's grabbable.
 */
export class SplitterWidget extends Widget {
  public override hoverInterest = true;
  public orientation: SplitterOrientation = "vertical";
  /**
   * Fired on each drag step with the pointer delta (cells) along the axis.
   * Initialized (not `declare`d) so the React host-config's generic prop
   * mapping sees the field via an `in` check and forwards the callback.
   */
  public onResize: ((delta: number) => void) | undefined = undefined;

  private dragging = false;
  private hovered = false;
  private lastPos = 0;

  constructor() {
    super("splitter");
    // Hover highlight is paint-only (the grip recolors, the layout is unchanged),
    // so repaint rather than relayout the whole tree on every enter/leave.
    this.onMouseEnter = () => {
      this.hovered = true;
      App.instance?.queueRepaint(null, "splitter:hover-enter");
    };
    this.onMouseLeave = () => {
      if (this.dragging) return;
      this.hovered = false;
      App.instance?.queueRepaint(null, "splitter:hover-leave");
    };
  }

  public override handleMouse(ev: MouseEvent): void {
    super.handleMouse(ev);
    if (ev.handled) return;

    const axisPos = this.orientation === "vertical" ? ev.x : ev.y;

    if (ev.type === "press" && ev.button === "left") {
      this.dragging = true;
      this.lastPos = axisPos;
      ev.handled = true;
    } else if (ev.type === "drag" && this.dragging) {
      const delta = axisPos - this.lastPos;
      if (delta !== 0) {
        this.lastPos = axisPos;
        this.onResize?.(delta);
      }
      ev.handled = true;
    } else if (ev.type === "release") {
      this.dragging = false;
      this.hovered = false;
      ev.handled = true;
      App.instance?.queueRender();
    }
  }

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
    const rect = this.getClientRect();

    const active = this.hovered || this.dragging;
    const color = active
      ? App.instance?.cssResolver.resolveVariable(this, "$primary") || "#4daafc"
      : App.instance?.cssResolver.resolveVariable(this, "$border") || "#3c3c3c";
    const style = new Style({
      color,
      background: this.findResolvedBackground(),
      bold: active,
    });

    if (this.orientation === "vertical") {
      const glyph = active ? "┃" : "│";
      for (let y = rect.y; y < rect.bottom; y++) {
        buffer.setCell(rect.x, y, glyph, style);
      }
    } else {
      const glyph = active ? "━" : "─";
      for (let x = rect.x; x < rect.right; x++) {
        buffer.setCell(x, rect.y, glyph, style);
      }
    }
  }
}
