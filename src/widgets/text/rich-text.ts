import { App } from "../../core/app.ts";
import { runCols } from "../../core/selection.ts";
import { Widget } from "../../dom/widget.ts";
import type { MouseEvent } from "../../driver/driver.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { RichText, splitRichTextIntoLines } from "../../render/rich/text.ts";
import { wrapSegmentLine } from "../../render/rich/wrap.ts";
import { type Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { logger } from "../../utils/logger.ts";
import { handleReadonlySelectionMouse } from "../readonly-selection.ts";

export class RichTextWidget extends Widget {
  /**
   * Word-wrap the text to the content width instead of clipping a long line.
   * Off by default (intrinsic single-row sizing); turned on for flowing prose
   * such as Markdown paragraphs and blockquotes.
   */
  public wrap = false;

  /**
   * Width budget for wrapping, set by a parent that knows the real viewport even
   * when it offers children an expanded measure bound (e.g. a horizontally
   * scrollable Markdown that still wants prose to wrap to the viewport). When
   * unset, wrapping falls back to the offered `maxW`.
   */
  public wrapWidthHint?: number;

  constructor() {
    super("richtext");
  }

  /** Content width available for text, given a measure budget `maxW`. */
  private wrapWidth(maxW: number): number {
    const b = this.borderSize;
    const p = this.padding;
    const budget = this.wrapWidthHint ?? maxW;
    const wStyle = this.computedStyle.width;
    const outer = typeof wStyle === "number" ? wStyle : budget;
    return Math.max(0, Math.min(outer, budget) - b.width - p.width);
  }

  // 1-slot memo of the parsed markup. parseMarkup is called two-to-three times a
  // frame (measure, render, selection), and markup parsing costs ~20µs for a
  // paragraph — but the raw text almost never changes between frames, so caching
  // the last (rawText → parsed) pair turns the repeats into a string compare. The
  // parsed RichText is immutable to callers (they only read `.plain`/`.spans`).
  private _markupSrc: string | null = null;
  private _markupParsed: RichText | null = null;

  /** Parse this widget's markup, falling back to plain text on bad markup. */
  private parseMarkup(): RichText {
    const raw = this.getTextContent();
    if (!raw) return new RichText("", []);
    if (this._markupSrc === raw && this._markupParsed) return this._markupParsed;
    let parsed: RichText;
    try {
      parsed = RichText.fromMarkup(raw);
    } catch (err) {
      logger.warn("richtext", `invalid markup; rendering as plain text: ${this.describe()}`, err);
      parsed = new RichText(raw, []);
    }
    this._markupSrc = raw;
    this._markupParsed = parsed;
    return parsed;
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
   * Lay the text out into display rows of segments for a content width: hard
   * newlines first, then (when {@link wrap} is on and the width is positive)
   * greedy word-wrap so a long line flows across the rows it needs instead of
   * clipping.
   */
  private displayRows(width: number, baseStyle: Style): Segment[][] {
    const rich = this.parseMarkup();
    const hardLines = splitRichTextIntoLines(rich);
    if (!this.wrap || width <= 0) return hardLines.map((l) => l.toSegments(baseStyle));
    const out: Segment[][] = [];
    for (const lineRich of hardLines) {
      const segs = lineRich.toSegments(baseStyle);
      for (const rowSegs of wrapSegmentLine(segs, width)) out.push(rowSegs);
    }
    return out;
  }

  public override measure(maxW: number, maxH: number): void {
    super.measure(maxW, maxH);
    const raw = this.getTextContent();
    if (!raw) return;
    const rows = this.displayRows(this.wrapWidth(maxW), Style.DEFAULT);
    if (rows.length <= 1 && !this.wrap) return; // single-line: base measure is right.
    const b = this.borderSize;
    const p = this.padding;
    if (this.computedStyle.height === undefined) {
      this.measuredHeight = Math.min(Math.max(1, rows.length) + b.height + p.height, maxH);
    }
    if (this.computedStyle.width === undefined) {
      const widest = rows.reduce(
        (m, segs) =>
          Math.max(
            m,
            segs.reduce((w, s) => w + stringWidth(s.text), 0),
          ),
        0,
      );
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

    // One display row per hard newline, then word-wrapped (when `wrap` is on) to
    // the content width — each row is its own logical selection line.
    const rows = this.displayRows(contentRect.width, baseStyle);

    for (let line = 0; line < rows.length; line++) {
      const y = contentRect.y + line;
      if (y >= contentRect.bottom) break; // clipped past the box height
      const segments = rows[line];
      const plain = segments.map((s) => s.text).join("");

      let x = contentRect.x;
      const textLen = stringWidth(plain);
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
      if (this.selectable && plain.length > 0) {
        const maxCols = Math.max(0, contentRect.right - x);
        const cols = runCols(plain).slice(0, maxCols);
        if (cols.length > 0) {
          App.instance?.selection.addRun({ widget: this, line, y, x, cols });
        }
      }
    }
  }
}
