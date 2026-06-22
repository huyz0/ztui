import { Widget } from "../../dom/widget.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";

/**
 * The `▌` accent bar drawn beside a blockquote / GFM-alert body. Pure chrome
 * (never selectable), and it paints one bar glyph on *every* row of its region
 * so it spans the full height of a multi-line quote body — a plain
 * {@link RichTextWidget} would only mark the first row.
 */
export class QuoteBarWidget extends Widget {
  constructor() {
    super("richtext"); // keep the richtext tag so existing styling/queries apply
    this.selectable = false;
  }

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
    const rect = this.getContentRect();
    const style = new Style({
      color: this.computedStyle.color || "default",
      background: this.findResolvedBackground(),
      dim: this.computedStyle.dim,
    });
    const bar = new Segment("▌", style);
    for (let y = rect.y; y < rect.bottom; y++) {
      buffer.drawSegment(rect.x, y, bar, rect);
    }
  }
}
