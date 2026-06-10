import { App } from "../../core/app.ts";
import { logger } from "../../core/logger.ts";
import { runCols } from "../../core/selection.ts";
import { Widget } from "../../dom/widget.ts";
import type { MouseEvent } from "../../driver/driver.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { RichText } from "../../render/rich/text.ts";
import { stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { handleReadonlySelectionMouse } from "../readonly-selection.ts";

export class RichTextWidget extends Widget {
  constructor() {
    super("richtext");
  }

  /** The plain text value (markup stripped) as the single selectable line. */
  public selectableLines(): string[] {
    const raw = this.getTextContent();
    if (!raw) return [];
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
    const rawText = this.getTextContent();
    if (!rawText) return;

    const fg = this.computedStyle.color || "default";
    const bg = this.findResolvedBackground();
    const baseStyle = new Style({
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

    // Bad markup must not blank the widget — fall back to the raw text and log.
    let rich: RichText;
    try {
      rich = RichText.fromMarkup(rawText);
    } catch (err) {
      logger.warn("richtext", `invalid markup; rendering as plain text: ${this.describe()}`, err);
      rich = new RichText(rawText, []);
    }
    const segments = rich.toSegments(baseStyle);

    let x = contentRect.x;
    const textLen = stringWidth(rich.plain);
    if (this.computedStyle.align === "center") {
      x = Math.max(contentRect.x, contentRect.x + Math.floor((contentRect.width - textLen) / 2));
    } else if (this.computedStyle.align === "right") {
      x = Math.max(contentRect.x, contentRect.right - textLen);
    }

    let currentX = x;
    for (const segment of segments) {
      buffer.drawSegment(currentX, contentRect.y, segment, contentRect);
      currentX += stringWidth(segment.text);
    }

    // Register the rendered line as selectable content (clipped to the box).
    if (this.selectable && rich.plain.length > 0) {
      const maxCols = Math.max(0, contentRect.right - x);
      const cols = runCols(rich.plain).slice(0, maxCols);
      if (cols.length > 0) {
        App.instance?.selection.addRun({ widget: this, line: 0, y: contentRect.y, x, cols });
      }
    }
  }
}
