import { App } from "../../core/app.ts";
import { logger } from "../../core/logger.ts";
import { runCols } from "../../core/selection.ts";
import { Widget } from "../../dom/widget.ts";
import type { MouseEvent } from "../../driver/driver.ts";
import type { Region } from "../../geometry/region.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { RichText } from "../../render/rich/text.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { handleReadonlySelectionMouse } from "../readonly-selection.ts";

export class LabelWidget extends Widget {
  /** Parse the text as console markup (`[bold red]…[/]`) instead of plain text. */
  public markup = false;

  constructor() {
    super("label");
  }

  /** The rendered text with any markup stripped — the copyable "core value". */
  public selectableLines(): string[] {
    const raw = this.getTextContent();
    if (!raw) return [];
    if (!this.markup) return [raw];
    try {
      return [RichText.fromMarkup(raw).plain];
    } catch {
      return [raw];
    }
  }

  public override handleMouse(ev: MouseEvent): void {
    super.handleMouse(ev);
    if (ev.handled) return;
    handleReadonlySelectionMouse(this, ev);
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

    let plain = text;
    let x: number;

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
      plain = rich.plain;
      x = this.alignedX(contentRect, stringWidth(plain));
      let currentX = x;
      for (const segment of rich.toSegments(style)) {
        buffer.drawSegment(currentX, contentRect.y, segment, contentRect);
        currentX += stringWidth(segment.text);
      }
    } else {
      x = this.alignedX(contentRect, stringWidth(text));
      buffer.drawSegment(x, contentRect.y, new Segment(text, style), contentRect);
    }

    // Register the rendered line as selectable content (clipped to the box) so a
    // drag can highlight and copy it, matching RichText/Syntax/RichLog.
    if (this.selectable && plain.length > 0) {
      const maxCols = Math.max(0, contentRect.right - x);
      const cols = runCols(plain).slice(0, maxCols);
      if (cols.length > 0) {
        App.instance?.selection.addRun({ widget: this, line: 0, y: contentRect.y, x, cols });
      }
    }
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
