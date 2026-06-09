import { Widget } from "../../dom/widget.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";

export class LabelWidget extends Widget {
  constructor() {
    super("label");
  }

  public render(buffer: ScreenBuffer): void {
    super.render(buffer);
    const contentRect = this.getContentRect();
    const text = this.getTextContent();
    if (!text) return;

    const fg = this.computedStyle.color || "default";
    const bg = this.findResolvedBackground();
    const style = new Style({
      color: fg,
      background: bg,
      bold: this.computedStyle.bold,
      italic: this.computedStyle.italic,
      underline: this.computedStyle.underline,
      reverse: this.computedStyle.reverse,
      dim: this.computedStyle.dim,
      strikethrough: this.computedStyle.strikethrough,
      link: this.computedStyle.link,
    });

    let x = contentRect.x;
    const textLen = stringWidth(text);
    if (this.computedStyle.align === "center") {
      x = Math.max(contentRect.x, contentRect.x + Math.floor((contentRect.width - textLen) / 2));
    } else if (this.computedStyle.align === "right") {
      x = Math.max(contentRect.x, contentRect.right - textLen);
    }

    const segment = new Segment(text, style);
    buffer.drawSegment(x, contentRect.y, segment, contentRect);
  }
}
