import { Widget } from "../dom/widget.ts";
import { TextNode } from "../react/host-config.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { Segment } from "../render/segment.ts";
import { Style } from "../render/style.ts";

export class HeaderWidget extends Widget {
  constructor() {
    super("header");
    this.defaultStyle = {
      dock: "top",
      height: 1,
      background: "blue",
      color: "white",
    };
  }

  public getTextContent(): string {
    let text = "";
    for (const child of this.children) {
      if (child instanceof TextNode) {
        text += child.text;
      }
    }
    return text.trim();
  }

  public render(buffer: ScreenBuffer): void {
    super.render(buffer);
    const contentRect = this.getContentRect();
    const text = this.getTextContent() || "ZTUI Application";

    const fg = this.computedStyle.color || "white";
    const bg = this.computedStyle.background || "blue";
    const style = new Style({ color: fg, background: bg });

    const textLen = text.length;
    const x = Math.max(
      contentRect.x,
      contentRect.x + Math.floor((contentRect.width - textLen) / 2),
    );
    const y = contentRect.y;

    const segment = new Segment(text, style);
    buffer.drawSegment(x, y, segment, contentRect);
  }
}
