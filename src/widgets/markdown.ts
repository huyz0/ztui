import { Widget } from "../dom/widget.ts";
import { parseDimension } from "../layout/layout.ts";
import { TextNode } from "../react/host-config.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { Markdown } from "../render/rich/markdown.ts";
import { stringWidth } from "../render/segment.ts";
import { Style } from "../render/style.ts";

export class MarkdownWidget extends Widget {
  public theme: "ansi_dark" | "ansi_light" = "ansi_dark";

  constructor() {
    super("markdown");
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

  public override measure(maxW: number, maxH: number): void {
    const rawMarkdown = this.getTextContent();
    const lines = rawMarkdown ? Markdown.renderToLines(rawMarkdown, this.theme) : [];

    let totalHeight = 0;
    let maxLineLen = 0;
    for (const line of lines) {
      if ((line as any).graphic) {
        totalHeight += (line as any).graphic.cellHeight;
        maxLineLen = Math.max(maxLineLen, (line as any).graphic.cellWidth);
      } else {
        totalHeight += 1;
        maxLineLen = Math.max(maxLineLen, stringWidth(line.plain));
      }
    }

    const wVal = parseDimension(this.computedStyle.width, maxW, -1);
    if (wVal === -1 || (typeof wVal === "object" && "fr" in wVal)) {
      this.measuredWidth = maxLineLen + this.borderSize.width + this.padding.width;
    } else {
      this.measuredWidth = wVal as number;
    }

    const hVal = parseDimension(this.computedStyle.height, maxH, -1);
    if (hVal === -1 || (typeof hVal === "object" && "fr" in hVal)) {
      this.measuredHeight = totalHeight + this.borderSize.height + this.padding.height;
    } else {
      this.measuredHeight = hVal as number;
    }
  }

  public render(buffer: ScreenBuffer): void {
    super.render(buffer);
    const contentRect = this.getContentRect();
    const rawMarkdown = this.getTextContent();
    if (!rawMarkdown) return;

    const lines = Markdown.renderToLines(rawMarkdown, this.theme);

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

    let currentY = contentRect.y;
    for (const line of lines) {
      if (currentY >= contentRect.bottom) {
        break; // clip vertically
      }

      if ((line as any).graphic) {
        const g = (line as any).graphic;
        const targetW = Math.min(g.cellWidth, contentRect.width);
        const targetH = Math.min(g.cellHeight, contentRect.bottom - currentY);

        if (targetW > 0 && targetH > 0) {
          buffer.cells[currentY][contentRect.x] = {
            char: " ",
            style: baseStyle,
            wideContinuation: false,
            graphic: {
              type: "image",
              pixelBuffer: g.pixelBuffer,
              pixelWidth: g.pixelWidth,
              pixelHeight: g.pixelHeight,
              cellWidth: targetW,
              cellHeight: targetH,
              pngBase64: g.pngBase64,
            },
          };

          for (let dy = 0; dy < targetH; dy++) {
            for (let dx = 0; dx < targetW; dx++) {
              if (dy === 0 && dx === 0) continue;
              buffer.cells[currentY + dy][contentRect.x + dx] = {
                char: "",
                style: baseStyle,
                wideContinuation: true,
              };
            }
          }
        }
        currentY += g.cellHeight;
        continue;
      }

      const segments = line.toSegments(baseStyle);
      let currentX = contentRect.x;

      for (const segment of segments) {
        if (currentX >= contentRect.right) {
          break; // clip horizontally
        }
        buffer.drawSegment(currentX, currentY, segment, contentRect);
        currentX += stringWidth(segment.text);
      }

      currentY++;
    }
  }
}
