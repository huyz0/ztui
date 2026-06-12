import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Style } from "../../render/style.ts";

export type DividerOrientation = "vertical" | "horizontal";

/**
 * A non-interactive separator rule: a `│` column (`vertical`) or `─` row
 * (`horizontal`) drawn in the theme's `$border` colour. Unlike {@link Splitter}
 * it has no drag/hover behaviour — it's purely a visual divider, e.g. between a
 * dock rail and the panel beside it.
 */
export class DividerWidget extends Widget {
  public orientation: DividerOrientation = "vertical";

  constructor() {
    super("divider");
    this.defaultStyle = { width: 1, height: 1 };
  }

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
    const rect = this.getClientRect();
    const color = this.computedStyle.color
      ? this.computedStyle.color
      : App.instance?.cssResolver.resolveVariable(this, "$border") || "gray";
    const style = new Style({ color, background: this.findResolvedBackground() });

    if (this.orientation === "vertical") {
      for (let y = rect.y; y < rect.bottom; y++) buffer.setCell(rect.x, y, "│", style);
    } else {
      for (let x = rect.x; x < rect.right; x++) buffer.setCell(x, rect.y, "─", style);
    }
  }
}
