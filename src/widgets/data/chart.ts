import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import { parseDimension } from "../../layout/layout.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { truncate } from "../../render/text-wrap.ts";

/** Horizontal eighth-blocks (1/8 → 8/8) for sub-cell bar precision. */
const HBARS = ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"] as const;

/** Format a number compactly for an axis/value label. */
function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}

function resolveColor(widget: Widget, color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  if (color.startsWith("$")) {
    return (widget.app ?? App.instance)?.cssResolver.resolveVariable(widget, color) || fallback;
  }
  return color;
}

/** One bar in a {@link BarChartWidget}. */
export interface BarChartItem {
  /** Row label shown before the bar (truncated as space tightens). */
  label?: string;
  /** Bar magnitude. */
  value: number;
  /** Bar colour (theme `$var` or literal); defaults to `$accent`. */
  color?: string;
}

/**
 * A horizontal bar chart — one row per {@link BarChartItem} — for comparing a
 * handful of labelled magnitudes (top routes, model usage, error counts). Bars
 * scale from {@link min} (default 0) to {@link max} (default the data max), with
 * eighth-block sub-cell precision.
 *
 * Space-constrained by design: when the width tightens it sheds the value column
 * first, then truncates labels, always keeping at least the bar; when the height
 * is shorter than the data it shows the rows that fit. Nothing is ever drawn
 * outside the content box.
 *
 * ```tsx
 * <BarChart items={[{ label: "gpt-4o", value: 120 }, { label: "haiku", value: 80 }]} />
 * ```
 */
export class BarChartWidget extends Widget {
  /** Rows to chart. */
  public items: BarChartItem[] = [];
  /** Scale floor (default 0). */
  public min?: number;
  /** Scale ceiling (default the largest value). */
  public max?: number;
  /** Print each value after its bar (dropped first when space is tight). Default true. */
  public showValue = true;

  constructor() {
    super("bar-chart");
    this.defaultStyle = { width: 40 };
  }

  public override measure(maxW: number, maxH: number): void {
    const b = this.borderSize;
    const p = this.padding;
    const wStyle = this.computedStyle.width;
    const hStyle = this.computedStyle.height;
    const intrinsicW = 40;
    const intrinsicH = Math.max(1, this.items.length);

    const w = wStyle === undefined ? intrinsicW : parseDimension(wStyle, maxW, -1);
    this.measuredWidth = (typeof w === "number" ? w : intrinsicW) + b.width + p.width;
    const h = hStyle === undefined ? intrinsicH : parseDimension(hStyle, maxH, -1);
    this.measuredHeight = (typeof h === "number" ? h : intrinsicH) + b.height + p.height;
  }

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
    const rect = this.getContentRect();
    if (rect.width <= 0 || rect.height <= 0 || this.items.length === 0) return;

    const bg = this.findResolvedBackground();
    const fg = this.computedStyle.color || resolveColor(this, "$foreground", "default");
    const dimmed = resolveColor(this, "$dimmed", "gray");
    const accent = resolveColor(this, "$accent", "#4daafc");

    const rows = Math.min(this.items.length, rect.height); // clip rows that don't fit
    const lo = this.min ?? 0;
    const hi = this.max ?? Math.max(lo, ...this.items.map((it) => it.value));

    // Allocate columns: label | bar | value. Shed the value column first, then
    // shrink/drop labels, so the bar always survives a tight width.
    const hasLabels = this.items.some((it) => it.label);
    const maxLabel = hasLabels
      ? Math.max(...this.items.map((it) => stringWidth(it.label ?? "")))
      : 0;
    let valueW = this.showValue
      ? Math.max(...this.items.map((it) => stringWidth(fmtNum(it.value))))
      : 0;
    let labelW = Math.min(maxLabel, 16, Math.max(0, Math.floor(rect.width * 0.4)));

    const MIN_BAR = 1;
    const need = () => labelW + (labelW ? 1 : 0) + valueW + (valueW ? 1 : 0);
    let barCols = rect.width - need();
    while (barCols < MIN_BAR && (valueW > 0 || labelW > 0)) {
      if (valueW > 0) valueW = 0;
      else labelW = labelW > 4 ? Math.floor(labelW / 2) : 0;
      barCols = rect.width - need();
    }
    barCols = Math.max(0, barCols);
    if (barCols === 0) return;

    for (let i = 0; i < rows; i++) {
      const item = this.items[i];
      const y = rect.y + i;
      let x = rect.x;

      if (labelW > 0) {
        const label = truncate(item.label ?? "", labelW);
        buffer.drawSegment(
          x,
          y,
          new Segment(label, new Style({ color: dimmed, background: bg })),
          rect,
        );
        x += labelW + 1; // +1 gap
      }

      // Bar length in eighths within barCols.
      const t = hi > lo ? Math.max(0, Math.min(1, (item.value - lo) / (hi - lo))) : 0;
      const eighths = Math.round(t * barCols * 8);
      const full = Math.floor(eighths / 8);
      const partial = eighths % 8;
      const barColor = resolveColor(this, item.color, accent);
      const barStyle = new Style({ color: barColor, background: bg });
      let bx = x;
      for (let c = 0; c < full && bx < x + barCols; c++, bx++) {
        buffer.setCell(bx, y, "█", barStyle);
      }
      if (partial > 0 && bx < x + barCols) {
        buffer.setCell(bx, y, HBARS[partial - 1], barStyle);
        bx++;
      }

      if (valueW > 0) {
        const vx = x + barCols + 1;
        buffer.drawSegment(
          vx,
          y,
          new Segment(fmtNum(item.value), new Style({ color: fg, background: bg })),
          rect,
        );
      }
    }
  }
}

// ── Braille line plot ─────────────────────────────────────────────────────

const BRAILLE_BASE = 0x2800;
// Unicode braille dot bit for (dx ∈ {0,1}, dy ∈ {0..3}).
const DOT_BITS = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
];

/**
 * A braille line plot — each terminal cell is a 2×4 dot grid, so a `cols×rows`
 * box yields a `(cols*2)×(rows*4)` plotting surface. Plots one or more numeric
 * series (connected with lines) over a shared value range, each in its own
 * colour. Ideal for trends/metrics that need more fidelity than a Sparkline.
 *
 * Constraint-resilient: it fills whatever content box it is given (down to a
 * single 2×4 cell), and copes with empty, single-point, and flat series without
 * dividing by zero or drawing out of bounds.
 *
 * ```tsx
 * <LinePlot series={[latencyP50, latencyP99]} colors={["$accent", "$warning"]} />
 * ```
 */
export class LinePlotWidget extends Widget {
  /** A single series (convenience for one line). */
  public data: number[] = [];
  /** Multiple series; when set, takes precedence over {@link data}. */
  public series?: number[][];
  /** Per-series colours (theme `$var` or literal); cycles if shorter than the series count. */
  public colors?: string[];
  /** Value-range floor (default the data minimum). */
  public min?: number;
  /** Value-range ceiling (default the data maximum). */
  public max?: number;

  constructor() {
    super("line-plot");
    this.defaultStyle = { width: 40, height: 8 };
  }

  private allSeries(): number[][] {
    if (this.series && this.series.length > 0) return this.series.filter((s) => s.length > 0);
    return this.data.length > 0 ? [this.data] : [];
  }

  public override measure(maxW: number, maxH: number): void {
    const b = this.borderSize;
    const p = this.padding;
    const w =
      this.computedStyle.width === undefined
        ? 40
        : parseDimension(this.computedStyle.width, maxW, -1);
    const h =
      this.computedStyle.height === undefined
        ? 8
        : parseDimension(this.computedStyle.height, maxH, -1);
    this.measuredWidth = (typeof w === "number" ? w : 40) + b.width + p.width;
    this.measuredHeight = (typeof h === "number" ? h : 8) + b.height + p.height;
  }

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
    const rect = this.getContentRect();
    const series = this.allSeries();
    if (rect.width <= 0 || rect.height <= 0 || series.length === 0) return;

    const cols = rect.width;
    const rowsN = rect.height;
    const dotsW = cols * 2;
    const dotsH = rowsN * 4;

    // Per-cell dot mask + the colour of the last series to light it.
    const mask = new Uint8Array(cols * rowsN);
    const cellColor: (string | undefined)[] = new Array(cols * rowsN);

    const all = series.flat();
    const lo = this.min ?? Math.min(...all);
    const hi = this.max ?? Math.max(...all);
    const span = hi - lo;

    const bg = this.findResolvedBackground();
    const palette = ["$accent", "$success", "$warning", "$error", "$secondary"];

    const yDot = (v: number): number => {
      const t = span > 0 ? (v - lo) / span : 0.5; // flat series → middle
      return Math.round((1 - Math.max(0, Math.min(1, t))) * (dotsH - 1));
    };
    const xDot = (i: number, n: number): number =>
      n <= 1 ? 0 : Math.round((i / (n - 1)) * (dotsW - 1));

    const plot = (px: number, py: number, color: string) => {
      if (px < 0 || py < 0 || px >= dotsW || py >= dotsH) return;
      const cx = px >> 1;
      const cy = py >> 2;
      const idx = cy * cols + cx;
      mask[idx] |= DOT_BITS[px & 1][py & 3];
      cellColor[idx] = color;
    };
    // Bresenham between two dots so the line is continuous, not a dotty scatter.
    const line = (x0: number, y0: number, x1: number, y1: number, color: string) => {
      const dx = Math.abs(x1 - x0);
      const dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      let x = x0;
      let y = y0;
      for (;;) {
        plot(x, y, color);
        if (x === x1 && y === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          x += sx;
        }
        if (e2 <= dx) {
          err += dx;
          y += sy;
        }
      }
    };

    series.forEach((s, si) => {
      const color = resolveColor(
        this,
        this.colors?.[si] ?? palette[si % palette.length],
        "#4daafc",
      );
      const n = s.length;
      let prevX = xDot(0, n);
      let prevY = yDot(s[0]);
      plot(prevX, prevY, color);
      for (let i = 1; i < n; i++) {
        const cx = xDot(i, n);
        const cy = yDot(s[i]);
        line(prevX, prevY, cx, cy, color);
        prevX = cx;
        prevY = cy;
      }
    });

    for (let cy = 0; cy < rowsN; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const idx = cy * cols + cx;
        if (mask[idx] === 0) continue;
        const ch = String.fromCharCode(BRAILLE_BASE + mask[idx]);
        const style = new Style({ color: cellColor[idx] ?? "#4daafc", background: bg });
        buffer.setCell(rect.x + cx, rect.y + cy, ch, style);
      }
    }
  }
}
