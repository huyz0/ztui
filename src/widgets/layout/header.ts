import { Widget } from "../../dom/widget.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";

export class HeaderWidget extends Widget {
  constructor() {
    super("header");
    this.defaultStyle = {
      dock: "top",
      height: 1,
      background: "$primary",
      color: "$background",
    };
  }

  public override getTextContent(): string {
    return super.getTextContent().trim();
  }

  public render(buffer: ScreenBuffer): void {
    super.render(buffer);
    const contentRect = this.getContentRect();
    const text = this.getTextContent() || "ZTUI Application";

    const fg = this.computedStyle.color || "default";
    const bg = this.findResolvedBackground();
    const style = new Style({ color: fg, background: bg });

    const textLen = stringWidth(text);
    const x = Math.max(
      contentRect.x,
      contentRect.x + Math.floor((contentRect.width - textLen) / 2),
    );
    const y = contentRect.y;

    const segment = new Segment(text, style);
    buffer.drawSegment(x, y, segment, contentRect);
  }
}
