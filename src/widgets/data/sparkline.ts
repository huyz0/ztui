import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import { parseDimension } from "../../layout/layout.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";

/** Bar glyphs from shortest to tallest (eighth-block steps). */
const BARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

/**
 * A one-row inline micro-chart for a stream of numbers — tokens/sec, latency,
 * cost, queue depth — the kind of dense, glanceable signal an agent HUD or
 * status bar wants. Each value becomes one eighth-block bar (`▁`–`█`) scaled
 * between {@link min} and {@link max} (auto-ranged from the data when unset).
 *
 * ```tsx
 * <Sparkline data={tokensPerSec} showValue />
 * ```
 *
 * The chart is intrinsically `data.length` cells wide; when constrained
 * narrower it shows the most recent values (the tail), so a live series scrolls
 * left as it grows. With {@link showValue} the latest value is printed after
 * the bars.
 */
export class SparklineWidget extends Widget {
  /** Series values to chart. */
  public data: number[] = [];
  /** Low end of the value scale; defaults to the data minimum. */
  /** Lower bound (auto-ranged when unset). */
  public min?: number;
  /** High end of the value scale; defaults to the data maximum. */
  /** Upper bound (auto-ranged when unset). */
  public max?: number;
  /** Print the latest value after the bars. */
  public showValue = false;

  constructor() {
    super("sparkline");
    this.defaultStyle = { height: 1 };
  }

  /** The trailing text (` 1234`) when {@link showValue} is on, else "". */
  private valueText(): string {
    if (!this.showValue || this.data.length === 0) return "";
    const last = this.data[this.data.length - 1];
    return ` ${Number.isInteger(last) ? last : last.toFixed(1)}`;
  }

  public override measure(maxW: number, maxH: number): void {
    const b = this.borderSize;
    const p = this.padding;
    const intrinsic = Math.max(1, this.data.length) + stringWidth(this.valueText());

    if (this.computedStyle.width === undefined) {
      this.measuredWidth = intrinsic + b.width + p.width;
    } else {
      const wVal = parseDimension(this.computedStyle.width, maxW, -1);
      this.measuredWidth = typeof wVal === "number" ? wVal : intrinsic + b.width + p.width;
    }

    if (this.computedStyle.height === undefined) {
      this.measuredHeight = 1 + b.height + p.height;
    } else {
      const hVal = parseDimension(this.computedStyle.height, maxH, -1);
      this.measuredHeight = typeof hVal === "number" ? hVal : 1 + b.height + p.height;
    }
  }

  /** Map a value to its bar glyph within [lo, hi]. */
  private barFor(value: number, lo: number, hi: number): string {
    if (hi <= lo) return BARS[0]; // flat series → all minimum bars
    const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
    const idx = Math.min(BARS.length - 1, Math.round(t * (BARS.length - 1)));
    return BARS[idx];
  }

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
    const content = this.getContentRect();
    if (content.width <= 0 || content.height <= 0 || this.data.length === 0) return;

    const bg = this.findResolvedBackground();
    const color =
      this.computedStyle.color ||
      (this.app ?? App.instance)?.cssResolver.resolveVariable(this, "$accent") ||
      "#4daafc";
    const style = new Style({
      color,
      background: bg,
      bold: this.computedStyle.bold,
      dim: this.computedStyle.dim,
    });

    const valueText = this.valueText();
    const valueW = stringWidth(valueText);
    const barCols = Math.max(0, content.width - valueW);

    // When narrower than the series, show the most recent `barCols` values so a
    // growing stream scrolls left.
    const values =
      this.data.length > barCols ? this.data.slice(this.data.length - barCols) : this.data;

    const lo = this.min ?? Math.min(...values);
    const hi = this.max ?? Math.max(...values);

    const y = content.y;
    let x = content.x;
    for (const v of values) {
      if (x >= content.x + barCols) break;
      buffer.drawSegment(x, y, new Segment(this.barFor(v, lo, hi), style), content);
      x += 1;
    }

    if (valueText) {
      const vx = content.x + barCols;
      const valueStyle = new Style({ color, background: bg, dim: true });
      buffer.drawSegment(vx, y, new Segment(valueText, valueStyle), content);
    }
  }
}
