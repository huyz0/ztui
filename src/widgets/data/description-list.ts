import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import { parseDimension } from "../../layout/layout.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { truncate, wrapText } from "../../render/text-wrap.ts";

/** One `term → description` pair in a {@link DescriptionListWidget}. */
export interface DescriptionItem {
  /** The key/label, shown in the left column. */
  term: string;
  /** The value, shown in the right column (wraps when space is tight). */
  description: string;
}

/** Default cap on the auto-sized term column, so one long key can't dominate. */
const TERM_CAP = 24;

function resolveColor(widget: Widget, color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  if (color.startsWith("$")) {
    return (widget.app ?? App.instance)?.cssResolver.resolveVariable(widget, color) || fallback;
  }
  return color;
}

/**
 * A two-column `term : description` list — the terminal analogue of an HTML
 * `<dl>` — for config dumps, key/value detail panes, and metadata summaries.
 * Terms share one auto-sized (or fixed) left column; descriptions fill the rest
 * and word-wrap, with continuation lines aligned under the description column.
 *
 * Space-constrained by design: it caps and truncates the term column, wraps the
 * description to whatever width remains, and clips rows that don't fit — never
 * drawing outside its content box.
 *
 * ```tsx
 * <DescriptionList items={[
 *   { term: "Model", description: "claude-opus-4-8" },
 *   { term: "Context", description: "200k tokens" },
 * ]} />
 * ```
 */
export class DescriptionListWidget extends Widget {
  /** Rows to render, top to bottom. */
  public items: DescriptionItem[] = [];
  /** Fixed term-column width; when unset, auto-sizes to the widest term (capped). */
  public termWidth?: number;
  /** Cells between the term and description columns. Default 2. */
  public gap = 2;
  /** Align terms within their column. Default `left`. */
  public termAlign: "left" | "right" = "left";
  /** Term colour (theme `$var` or literal); defaults to `$dimmed`. */
  public termColor?: string;

  constructor() {
    super("description-list");
  }

  /** Width of the term column: the fixed value, or the widest term capped at {@link TERM_CAP}. */
  private resolveTermWidth(): number {
    if (this.termWidth !== undefined) return Math.max(0, this.termWidth);
    let max = 0;
    for (const it of this.items) max = Math.max(max, stringWidth(it.term));
    return Math.min(max, TERM_CAP);
  }

  public override measure(maxW: number, maxH: number): void {
    const b = this.borderSize;
    const p = this.padding;
    const termW = this.resolveTermWidth();

    const maxDesc = this.items.reduce((m, it) => Math.max(m, stringWidth(it.description)), 0);
    const intrinsicW = termW + (termW > 0 ? this.gap : 0) + maxDesc;

    const wStyle = this.computedStyle.width;
    const w = wStyle === undefined ? intrinsicW : parseDimension(wStyle, maxW, -1);
    const contentW = typeof w === "number" ? w : intrinsicW;
    this.measuredWidth = contentW + b.width + p.width;

    const hStyle = this.computedStyle.height;
    if (hStyle === undefined) {
      const descW = Math.max(0, contentW - termW - (termW > 0 ? this.gap : 0));
      let rows = 0;
      for (const it of this.items) rows += Math.max(1, wrapText(it.description, descW).length);
      this.measuredHeight = rows + b.height + p.height;
    } else {
      const h = parseDimension(hStyle, maxH, -1);
      this.measuredHeight = (typeof h === "number" ? h : this.items.length) + b.height + p.height;
    }
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;
    super.render(buffer);

    const rect = this.getContentRect();
    if (rect.width < 1 || rect.height < 1 || this.items.length === 0) return;

    const bg = this.findResolvedBackground();
    const termColor = resolveColor(
      this,
      this.termColor,
      resolveColor(this, "$dimmed", "bright-black"),
    );
    const descColor = this.computedStyle.color || resolveColor(this, "$foreground", "default");
    const termStyle = new Style({
      color: termColor,
      background: bg,
      bold: this.computedStyle.bold,
    });
    const descStyle = new Style({ color: descColor, background: bg });

    const termW = Math.min(this.resolveTermWidth(), rect.width);
    const descX = rect.x + termW + (termW > 0 ? this.gap : 0);
    const descW = Math.max(0, rect.right - descX);

    let y = rect.y;
    for (const item of this.items) {
      if (y >= rect.y + rect.height) break;

      if (termW > 0) {
        const term = truncate(item.term, termW);
        const tx = this.termAlign === "right" ? rect.x + termW - stringWidth(term) : rect.x;
        buffer.drawSegment(tx, y, new Segment(term, termStyle), rect);
      }

      const lines = descW > 0 ? wrapText(item.description, descW) : [];
      if (lines.length === 0) {
        y += 1; // term-only row still advances
        continue;
      }
      for (const line of lines) {
        if (y >= rect.y + rect.height) break;
        buffer.drawSegment(descX, y, new Segment(line, descStyle), rect);
        y += 1;
      }
    }
  }
}
