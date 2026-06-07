import { Widget } from "../dom/widget.ts";
import { TextNode } from "../react/host-config.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { Segment } from "../render/segment.ts";
import { Style } from "../render/style.ts";

export class FooterWidget extends Widget {
  constructor() {
    super("footer");
    this.defaultStyle = {
      dock: "bottom",
      height: 1,
      background: "black",
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
    const text = this.getTextContent() || "Ctrl+C Exit  │  Tab Cycle Focus";

    const fg = this.computedStyle.color || "white";
    const bg = this.computedStyle.background || "black";
    const style = new Style({ color: fg, background: bg });

    const segment = new Segment(text, style);
    buffer.drawSegment(contentRect.x, contentRect.y, segment, contentRect);
  }
}
