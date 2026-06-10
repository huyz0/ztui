import { App } from "../../core/app.ts";
import { logger } from "../../core/logger.ts";
import { runCols } from "../../core/selection.ts";
import { Widget } from "../../dom/widget.ts";
import type { MouseEvent } from "../../driver/driver.ts";
import { parseDimension } from "../../layout/layout.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Syntax } from "../../render/rich/syntax.ts";
import { RichText } from "../../render/rich/text.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { handleReadonlySelectionMouse } from "../readonly-selection.ts";

export class SyntaxWidget extends Widget {
  public language = "text";
  public lineNumbers = true;

  constructor() {
    super("syntax");
  }

  /** Width of the rendered line-number gutter (`"<n> │ "`), or 0 when hidden. */
  private gutterWidth(): number {
    if (!this.lineNumbers) return 0;
    const code = this.getTextContent();
    const lineCount = code ? code.split(/\r?\n/).length : 1;
    return Math.max(2, String(lineCount).length) + 3;
  }

  /** The raw source as selectable lines — excludes the line-number gutter. */
  public selectableLines(): string[] {
    const code = this.getTextContent();
    return code ? code.split(/\r?\n/) : [];
  }

  public override handleMouse(ev: MouseEvent): void {
    super.handleMouse(ev);
    if (ev.handled) return;
    handleReadonlySelectionMouse(this, ev);
  }

  public override measure(maxW: number, maxH: number): void {
    const rawCode = this.getTextContent();
    const lines = rawCode ? rawCode.split(/\r?\n/) : [];
    const lineCount = lines.length;

    const wVal = parseDimension(this.computedStyle.width, maxW, -1);
    if (wVal === -1 || (typeof wVal === "object" && "fr" in wVal)) {
      let maxLineLen = 0;
      for (const line of lines) {
        maxLineLen = Math.max(maxLineLen, stringWidth(line));
      }
      if (this.lineNumbers) {
        const gutterWidth = Math.max(2, String(lineCount).length);
        maxLineLen += gutterWidth + 3; // + " │ "
      }
      this.measuredWidth = maxLineLen + this.borderSize.width + this.padding.width;
    } else {
      this.measuredWidth = wVal as number;
    }

    const hVal = parseDimension(this.computedStyle.height, maxH, -1);
    if (hVal === -1 || (typeof hVal === "object" && "fr" in hVal)) {
      this.measuredHeight = lineCount + this.borderSize.height + this.padding.height;
    } else {
      this.measuredHeight = hVal as number;
    }
  }

  public render(buffer: ScreenBuffer): void {
    super.render(buffer);
    const contentRect = this.getContentRect();
    const rawCode = this.getTextContent();
    if (!rawCode) return;

    // Highlighting must never blank the widget — fall back to plain lines + log.
    let lines: RichText[];
    try {
      lines = Syntax.renderToLines(rawCode, this.language, this.lineNumbers, this.theme || "theme");
    } catch (err) {
      logger.warn(
        "syntax",
        `highlight failed for language "${this.language}"; rendering plain: ${this.describe()}`,
        err,
      );
      lines = rawCode.split("\n").map((l) => new RichText(l, []));
    }

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

    const sourceLines = this.selectableLines();
    const gutter = this.gutterWidth();
    let currentY = contentRect.y;
    for (let li = 0; li < lines.length; li++) {
      if (currentY >= contentRect.bottom) {
        break; // clip vertically
      }

      const segments = lines[li].toSegments(baseStyle);
      let currentX = contentRect.x;

      for (const segment of segments) {
        if (currentX >= contentRect.right) {
          break; // clip horizontally
        }
        const resolvedColor = segment.style.color
          ? App.instance?.cssResolver.resolveVariable(this, segment.style.color) ||
            segment.style.color
          : undefined;
        const resolvedSegment = new Segment(
          segment.text,
          segment.style.merge({ color: resolvedColor }),
        );
        buffer.drawSegment(currentX, currentY, resolvedSegment, contentRect);
        currentX += stringWidth(segment.text);
      }

      // Register the code (gutter excluded) as selectable content for this line.
      if (this.selectable && sourceLines[li]) {
        const codeX = contentRect.x + gutter;
        const maxCols = Math.max(0, contentRect.right - codeX);
        const cols = runCols(sourceLines[li]).slice(0, maxCols);
        if (cols.length > 0) {
          App.instance?.selection.addRun({ widget: this, line: li, y: currentY, x: codeX, cols });
        }
      }

      currentY++;
    }
  }
}
