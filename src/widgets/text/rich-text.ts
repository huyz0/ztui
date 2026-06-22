import { App } from "../../core/app.ts";
import { runCols } from "../../core/selection.ts";
import { Widget } from "../../dom/widget.ts";
import type { MouseEvent } from "../../driver/driver.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { RichText, splitRichTextIntoLines } from "../../render/rich/text.ts";
import { stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { logger } from "../../utils/logger.ts";
import { handleReadonlySelectionMouse } from "../readonly-selection.ts";

export class RichTextWidget extends Widget {
  constructor() {
    super("richtext");
  }

  /** Parse this widget's markup, falling back to plain text on bad markup. */
  private parseMarkup(): RichText {
    const raw = this.getTextContent();
    if (!raw) return new RichText("", []);
    try {
      return RichText.fromMarkup(raw);
    } catch (err) {
      logger.warn("richtext", `invalid markup; rendering as plain text: ${this.describe()}`, err);
      return new RichText(raw, []);
    }
  }

  /**
   * The plain text value (markup stripped), split into one logical line per
   * embedded newline — a soft line break in a markdown paragraph/blockquote is a
   * real line, so it must select and copy as one. Empty when there is no content.
   */
  public selectableLines(): string[] {
    const rich = this.parseMarkup();
    if (rich.plain.length === 0) return [];
    return rich.plain.split("\n");
  }

  public override handleMouse(ev: MouseEvent): void {
    super.handleMouse(ev);
    if (ev.handled) return;
    handleReadonlySelectionMouse(this, ev);
  }

  /**
   * Intrinsic size from the (possibly multi-line) plain text: height is the line
   * count and width the widest line, so a paragraph carrying soft breaks lays out
   * across the rows it actually needs instead of overflowing a single row.
   */
  public override measure(maxW: number, maxH: number): void {
    super.measure(maxW, maxH);
    const raw = this.getTextContent();
    if (!raw) return;
    const lines = this.parseMarkup().plain.split("\n");
    if (lines.length <= 1) return; // single-line: the base measure is already right.
    const b = this.borderSize;
    const p = this.padding;
    if (this.computedStyle.height === undefined) {
      this.measuredHeight = Math.min(lines.length + b.height + p.height, maxH);
    }
    if (this.computedStyle.width === undefined) {
      const widest = lines.reduce((m, l) => Math.max(m, stringWidth(l)), 0);
      this.measuredWidth = Math.min(widest + b.width + p.width, maxW);
    }
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

    const rich = this.parseMarkup();
    // One row per embedded newline; each line is its own logical selection line.
    const lines = splitRichTextIntoLines(rich);

    for (let line = 0; line < lines.length; line++) {
      const y = contentRect.y + line;
      if (y >= contentRect.bottom) break; // clipped past the box height
      const lineRich = lines[line];
      const segments = lineRich.toSegments(baseStyle);

      let x = contentRect.x;
      const textLen = stringWidth(lineRich.plain);
      if (this.computedStyle.align === "center") {
        x = Math.max(contentRect.x, contentRect.x + Math.floor((contentRect.width - textLen) / 2));
      } else if (this.computedStyle.align === "right") {
        x = Math.max(contentRect.x, contentRect.right - textLen);
      }

      let currentX = x;
      for (const segment of segments) {
        buffer.drawSegment(currentX, y, segment, contentRect);
        currentX += stringWidth(segment.text);
      }

      // Register the rendered line as selectable content (clipped to the box).
      if (this.selectable && lineRich.plain.length > 0) {
        const maxCols = Math.max(0, contentRect.right - x);
        const cols = runCols(lineRich.plain).slice(0, maxCols);
        if (cols.length > 0) {
          App.instance?.selection.addRun({ widget: this, line, y, x, cols });
        }
      }
    }
  }
}
