import { Widget } from "../../dom/widget.ts";
import { parseDimension } from "../../layout/layout.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { truncate } from "../../render/text-wrap.ts";
import { resolveColor } from "../resolve-color.ts";

/** Horizontal eighth-blocks (1/8 → 8/8) for sub-cell bar precision. */
const HBARS = ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"] as const;

/** Format a number compactly for an axis/value label. */
function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
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

// ── Braille plotting surface ──────────────────────────────────────────────

const BRAILLE_BASE = 0x2800;
// Unicode braille dot bit for (dx ∈ {0,1}, dy ∈ {0..3}).
const DOT_BITS = [
  [0x01, 0x02, 0x04, 0x40],
  [0x08, 0x10, 0x20, 0x80],
];

/**
 * A `cols×rows` cell grid that addresses a `(cols*2)×(rows*4)` braille dot
 * surface — the shared canvas behind {@link LinePlotWidget},
 * {@link ScatterPlotWidget} and {@link AreaChartWidget}. Each lit dot also
 * records the colour of the series that lit it last.
 */
class BrailleGrid {
  readonly dotsW: number;
  readonly dotsH: number;
  private readonly mask: Uint8Array;
  private readonly cellColor: (string | undefined)[];

  constructor(
    private readonly cols: number,
    private readonly rows: number,
  ) {
    this.dotsW = cols * 2;
    this.dotsH = rows * 4;
    this.mask = new Uint8Array(cols * rows);
    this.cellColor = new Array(cols * rows);
  }

  /** Light a single dot, ignoring anything outside the surface. */
  plot(px: number, py: number, color: string): void {
    if (px < 0 || py < 0 || px >= this.dotsW || py >= this.dotsH) return;
    const cx = px >> 1;
    const cy = py >> 2;
    const idx = cy * this.cols + cx;
    this.mask[idx] |= DOT_BITS[px & 1][py & 3];
    this.cellColor[idx] = color;
  }

  /** Bresenham between two dots so a line is continuous, not a dotty scatter. */
  line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.plot(x, y, color);
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
  }

  /** Blit the lit cells into `buffer`, leaving empty cells untouched. */
  draw(
    buffer: ScreenBuffer,
    rect: { x: number; y: number },
    bg: string | undefined,
    fallback: string,
  ): void {
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const idx = cy * this.cols + cx;
        if (this.mask[idx] === 0) continue;
        const ch = String.fromCharCode(BRAILLE_BASE + this.mask[idx]);
        const style = new Style({ color: this.cellColor[idx] ?? fallback, background: bg });
        buffer.setCell(rect.x + cx, rect.y + cy, ch, style);
      }
    }
  }
}

/** Default series-colour rotation shared by the braille plots. */
const PLOT_PALETTE = ["$accent", "$success", "$warning", "$error", "$secondary"];

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

    const grid = new BrailleGrid(rect.width, rect.height);
    const all = series.flat();
    const lo = this.min ?? Math.min(...all);
    const hi = this.max ?? Math.max(...all);
    const span = hi - lo;
    const bg = this.findResolvedBackground();

    const yDot = (v: number): number => {
      const t = span > 0 ? (v - lo) / span : 0.5; // flat series → middle
      return Math.round((1 - Math.max(0, Math.min(1, t))) * (grid.dotsH - 1));
    };
    const xDot = (i: number, n: number): number =>
      n <= 1 ? 0 : Math.round((i / (n - 1)) * (grid.dotsW - 1));

    series.forEach((s, si) => {
      const color = resolveColor(
        this,
        this.colors?.[si] ?? PLOT_PALETTE[si % PLOT_PALETTE.length],
        "#4daafc",
      );
      const n = s.length;
      let prevX = xDot(0, n);
      let prevY = yDot(s[0]);
      grid.plot(prevX, prevY, color);
      for (let i = 1; i < n; i++) {
        const cx = xDot(i, n);
        const cy = yDot(s[i]);
        grid.line(prevX, prevY, cx, cy, color);
        prevX = cx;
        prevY = cy;
      }
    });

    grid.draw(buffer, rect, bg, "#4daafc");
  }
}

// ── Scatter plot ──────────────────────────────────────────────────────────

/** One point in a {@link ScatterPlotWidget} series. */
export interface ScatterPoint {
  x: number;
  y: number;
}

/**
 * A braille scatter plot — one or more series of `{x, y}` points drawn on the
 * shared 2×4-dot surface without connecting lines. Unlike {@link LinePlotWidget}
 * the x position is meaningful (not just the sample index), so it suits
 * correlations and clouds rather than ordered trends.
 *
 * Both axes auto-range over the data unless pinned via {@link minX}/{@link maxX}
 * and {@link minY}/{@link maxY}. Out-of-range points are simply not drawn.
 *
 * ```tsx
 * <ScatterPlot points={[{ x: 1, y: 2 }, { x: 3, y: 5 }]} />
 * ```
 */
export class ScatterPlotWidget extends Widget {
  /** A single series (convenience for one cloud). */
  public points: ScatterPoint[] = [];
  /** Multiple series; when set, takes precedence over {@link points}. */
  public series?: ScatterPoint[][];
  /** Per-series colours (theme `$var` or literal); cycles if shorter. */
  public colors?: string[];
  /** X-axis floor / ceiling (default the data range). */
  public minX?: number;
  public maxX?: number;
  /** Y-axis floor / ceiling (default the data range). */
  public minY?: number;
  public maxY?: number;

  constructor() {
    super("scatter-plot");
    this.defaultStyle = { width: 40, height: 8 };
  }

  private allSeries(): ScatterPoint[][] {
    if (this.series && this.series.length > 0) return this.series.filter((s) => s.length > 0);
    return this.points.length > 0 ? [this.points] : [];
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

    const grid = new BrailleGrid(rect.width, rect.height);
    const all = series.flat();
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    const xlo = this.minX ?? Math.min(...xs);
    const xhi = this.maxX ?? Math.max(...xs);
    const ylo = this.minY ?? Math.min(...ys);
    const yhi = this.maxY ?? Math.max(...ys);
    const xspan = xhi - xlo;
    const yspan = yhi - ylo;
    const bg = this.findResolvedBackground();

    const xDot = (v: number): number =>
      Math.round((xspan > 0 ? (v - xlo) / xspan : 0.5) * (grid.dotsW - 1));
    const yDot = (v: number): number =>
      Math.round((1 - (yspan > 0 ? (v - ylo) / yspan : 0.5)) * (grid.dotsH - 1));

    series.forEach((s, si) => {
      const color = resolveColor(
        this,
        this.colors?.[si] ?? PLOT_PALETTE[si % PLOT_PALETTE.length],
        "#4daafc",
      );
      for (const pt of s) grid.plot(xDot(pt.x), yDot(pt.y), color);
    });

    grid.draw(buffer, rect, bg, "#4daafc");
  }
}

// ── Area chart ────────────────────────────────────────────────────────────

/**
 * A braille area chart — a {@link LinePlotWidget} whose region *below* each
 * series line is filled in, for cumulative or volume-style trends. Series are
 * drawn in order, so a later (typically smaller) series paints over an earlier
 * one; pass them largest-first when stacking visually.
 *
 * Shares the line plot's value-range and constraint behaviour: it fills any box
 * down to a single cell and tolerates empty, single-point, and flat series.
 *
 * ```tsx
 * <AreaChart data={requestsPerMinute} colors={["$accent"]} style={{ height: 8 }} />
 * ```
 */
export class AreaChartWidget extends Widget {
  /** A single series (convenience for one area). */
  public data: number[] = [];
  /** Multiple series; when set, takes precedence over {@link data}. */
  public series?: number[][];
  /** Per-series colours (theme `$var` or literal); cycles if shorter. */
  public colors?: string[];
  /** Value-range floor (default 0) / ceiling (default the data maximum). */
  public min?: number;
  public max?: number;

  constructor() {
    super("area-chart");
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

    const grid = new BrailleGrid(rect.width, rect.height);
    const all = series.flat();
    const lo = this.min ?? 0;
    const hi = this.max ?? Math.max(lo, ...all);
    const span = hi - lo;
    const bg = this.findResolvedBackground();

    const yDot = (v: number): number => {
      const t = span > 0 ? (v - lo) / span : 0;
      return Math.round((1 - Math.max(0, Math.min(1, t))) * (grid.dotsH - 1));
    };

    series.forEach((s, si) => {
      const color = resolveColor(
        this,
        this.colors?.[si] ?? PLOT_PALETTE[si % PLOT_PALETTE.length],
        "#4daafc",
      );
      const n = s.length;
      // Sample the series at every dot-column and fill from the line down to the
      // baseline, so the area reads as a solid braille region.
      for (let px = 0; px < grid.dotsW; px++) {
        const f = n <= 1 ? 0 : (px / (grid.dotsW - 1)) * (n - 1);
        const i0 = Math.floor(f);
        const i1 = Math.min(n - 1, i0 + 1);
        const v = s[i0] + (s[i1] - s[i0]) * (f - i0);
        const top = yDot(v);
        for (let py = top; py < grid.dotsH; py++) grid.plot(px, py, color);
      }
    });

    grid.draw(buffer, rect, bg, "#4daafc");
  }
}

// ── Pie chart (100% stacked bar + legend) ──────────────────────────────────

/** One slice of a {@link PieChartWidget}. */
export interface PieSlice {
  /** Legend label. */
  label?: string;
  /** Slice magnitude (share of the total). */
  value: number;
  /** Slice colour (theme `$var` or literal); defaults to the palette rotation. */
  color?: string;
}

/**
 * A proportional breakdown rendered as a single 100%-stacked horizontal bar with
 * a percentage legend beneath — the terminal-friendly stand-in for a pie chart,
 * crisp at any width (a real circle only gets coarse and ambiguous in cells).
 *
 * Segment widths are allocated to sum exactly to the bar width (the largest
 * remainder absorbs rounding), so the bar always spans the full content box.
 * When height is tight the legend rows are clipped; the bar is kept first.
 *
 * ```tsx
 * <PieChart items={[{ label: "used", value: 70 }, { label: "free", value: 30 }]} />
 * ```
 */
export class PieChartWidget extends Widget {
  /** Slices to chart. */
  public items: PieSlice[] = [];
  /** Show the percentage legend below the bar. Default true. */
  public showLegend = true;

  constructor() {
    super("pie-chart");
    this.defaultStyle = { width: 40 };
  }

  public override measure(maxW: number, maxH: number): void {
    const b = this.borderSize;
    const p = this.padding;
    const intrinsicW = 40;
    const intrinsicH = 1 + (this.showLegend ? this.items.length : 0);
    const w =
      this.computedStyle.width === undefined
        ? intrinsicW
        : parseDimension(this.computedStyle.width, maxW, -1);
    const h =
      this.computedStyle.height === undefined
        ? intrinsicH
        : parseDimension(this.computedStyle.height, maxH, -1);
    this.measuredWidth = (typeof w === "number" ? w : intrinsicW) + b.width + p.width;
    this.measuredHeight = (typeof h === "number" ? h : intrinsicH) + b.height + p.height;
  }

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
    const rect = this.getContentRect();
    if (rect.width <= 0 || rect.height <= 0 || this.items.length === 0) return;

    const bg = this.findResolvedBackground();
    const dimmed = resolveColor(this, "$dimmed", "gray");
    const fg = this.computedStyle.color || resolveColor(this, "$foreground", "default");
    const accent = resolveColor(this, "$accent", "#4daafc");

    const valid = this.items.filter((it) => it.value > 0);
    const total = valid.reduce((a, it) => a + it.value, 0) || 1;
    const colorOf = (it: PieSlice, i: number): string =>
      resolveColor(this, it.color ?? PLOT_PALETTE[i % PLOT_PALETTE.length], accent);

    // Allocate integer segment widths that sum to the bar width, giving the
    // leftover cells to the slices with the largest fractional remainder.
    const barW = rect.width;
    const exact = valid.map((it) => (it.value / total) * barW);
    const widths = exact.map((e) => Math.floor(e));
    let leftover = barW - widths.reduce((a, w) => a + w, 0);
    valid
      .map((_, i) => i)
      .sort((a, b) => (exact[b] % 1) - (exact[a] % 1))
      .forEach((i) => {
        if (leftover > 0) {
          widths[i] += 1;
          leftover--;
        }
      });

    // Row 0: the stacked bar.
    let bx = rect.x;
    valid.forEach((it, i) => {
      const style = new Style({ color: colorOf(it, i), background: bg });
      for (let c = 0; c < widths[i] && bx < rect.x + barW; c++, bx++) {
        buffer.setCell(bx, rect.y, "█", style);
      }
    });

    // Remaining rows: one legend entry each, clipped to the available height.
    if (!this.showLegend) return;
    for (let i = 0; i < valid.length && 1 + i < rect.height; i++) {
      const it = valid[i];
      const y = rect.y + 1 + i;
      const pct = Math.round((it.value / total) * 100);
      buffer.drawSegment(
        rect.x,
        y,
        new Segment("■ ", new Style({ color: colorOf(it, i), background: bg })),
        rect,
      );
      const label = truncate(it.label ?? "", Math.max(0, rect.width - 8));
      buffer.drawSegment(
        rect.x + 2,
        y,
        new Segment(label, new Style({ color: fg, background: bg })),
        rect,
      );
      const pctStr = `${pct}%`;
      buffer.drawSegment(
        rect.x + rect.width - stringWidth(pctStr),
        y,
        new Segment(pctStr, new Style({ color: dimmed, background: bg })),
        rect,
      );
    }
  }
}
