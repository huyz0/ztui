import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";

/**
 * A decorative heavy-border outline drawn around this widget's own region — the
 * DevTools "highlight" box over an inspected widget. Positioned absolutely at the
 * target's screen rect by the React layer; draws only the outline (no fill) so
 * the inspected widget shows through. Mount it under a full-screen root so the
 * render clip doesn't crop the box.
 */
export class DevToolsHighlightWidget extends Widget {
  constructor() {
    super("devtools-highlight");
  }

  public override render(buffer: ScreenBuffer): void {
    const r = this.region;
    if (r.width < 1 || r.height < 1) return;
    const color = App.instance?.cssResolver.resolveVariable(this, "$accent") || "magenta";
    const style = this.cachedStyle({ color, bold: true });
    const x0 = r.x;
    const y0 = r.y;
    const x1 = r.x + r.width - 1;
    const y1 = r.y + r.height - 1;
    buffer.setCell(x0, y0, "┏", style);
    buffer.setCell(x1, y0, "┓", style);
    buffer.setCell(x0, y1, "┗", style);
    buffer.setCell(x1, y1, "┛", style);
    for (let x = x0 + 1; x < x1; x++) {
      buffer.setCell(x, y0, "━", style);
      buffer.setCell(x, y1, "━", style);
    }
    for (let y = y0 + 1; y < y1; y++) {
      buffer.setCell(x0, y, "┃", style);
      buffer.setCell(x1, y, "┃", style);
    }
  }
}
