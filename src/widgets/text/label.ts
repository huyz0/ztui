import { logger } from "../../core/logger.ts";
import { Widget } from "../../dom/widget.ts";
import type { Region } from "../../geometry/region.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { RichText } from "../../render/rich/text.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";

export class LabelWidget extends Widget {
  /** Parse the text as console markup (`[bold red]…[/]`) instead of plain text. */
  public markup = false;

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

    // Markup mode: parse into styled spans, falling back to the raw text (and a
    // warning) if the markup is malformed so the label is never blanked.
    if (this.markup) {
      let rich: RichText;
      try {
        rich = RichText.fromMarkup(text);
      } catch (err) {
        logger.warn("label", `invalid markup; rendering as plain text: ${this.describe()}`, err);
        rich = new RichText(text, []);
      }
      const segments = rich.toSegments(style);
      let currentX = this.alignedX(contentRect, stringWidth(rich.plain));
      for (const segment of segments) {
        buffer.drawSegment(currentX, contentRect.y, segment, contentRect);
        currentX += stringWidth(segment.text);
      }
      return;
    }

    const x = this.alignedX(contentRect, stringWidth(text));
    buffer.drawSegment(x, contentRect.y, new Segment(text, style), contentRect);
  }

  /** Left edge for the text, honouring the `align` style for the given width. */
  private alignedX(contentRect: Region, textLen: number): number {
    if (this.computedStyle.align === "center") {
      return Math.max(contentRect.x, contentRect.x + Math.floor((contentRect.width - textLen) / 2));
    }
    if (this.computedStyle.align === "right") {
      return Math.max(contentRect.x, contentRect.right - textLen);
    }
    return contentRect.x;
  }
}
