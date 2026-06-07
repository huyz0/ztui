import { Widget } from "../dom/widget.ts";
import { TextNode } from "../react/host-config.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { Segment, stringWidth } from "../render/segment.ts";
import { Style } from "../render/style.ts";

export class ButtonWidget extends Widget {
  constructor() {
    super("button");
    this.focusable = true;
    this.defaultStyle = { height: 3 };
    this.onKey = (ev) => {
      if (ev.key === "enter" || ev.key === " ") {
        if (this.onClick) {
          this.onClick(ev);
        }
      }
    };
  }

  public getTextContent(): string {
    let text = "";
    for (const child of this.children) {
      if (child instanceof TextNode) {
        text += child.text;
      }
    }
    return text;
  }

  public render(buffer: ScreenBuffer): void {
    if (this.computedStyle.border === undefined) {
      this.computedStyle.border = "solid";
    }

    super.render(buffer);

    const contentRect = this.getContentRect();
    const text = this.getTextContent();
    if (!text) return;

    const fg = this.focused ? "black" : this.computedStyle.color || "default";
    const bg = this.focused ? "white" : this.findResolvedBackground();
    const style = new Style({
      color: fg,
      background: bg,
      bold: true,
      strikethrough: this.computedStyle.strikethrough,
      link: this.computedStyle.link,
    });

    const textLen = stringWidth(text);
    const x = Math.max(
      contentRect.x,
      contentRect.x + Math.floor((contentRect.width - textLen) / 2),
    );
    const y = Math.max(contentRect.y, contentRect.y + Math.floor((contentRect.height - 1) / 2));

    const segment = new Segment(text, style);
    buffer.drawSegment(x, y, segment, contentRect);
  }
}
