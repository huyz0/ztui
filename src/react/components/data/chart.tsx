import type { BarChartItem, PieSlice, ScatterPoint } from "../../../widgets/data/chart.ts";
import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export type { BarChartItem, PieSlice, ScatterPoint };

/** Props for {@link BarChart}. */
export interface BarChartProps extends Omit<ComponentProps, "children"> {
  /** Rows to chart (label + value, optional per-bar colour). */
  items: BarChartItem[];
  /** Scale floor (default 0). */
  min?: number;
  /** Scale ceiling (default the largest value). */
  max?: number;
  /** Print each value after its bar (dropped first when space is tight). Default true. */
  showValue?: boolean;
}

/**
 * A horizontal bar chart for comparing labelled magnitudes. Sheds the value
 * column then truncates labels as width tightens, and clips rows that don't fit
 * — always keeping the bars on-screen.
 *
 * ```tsx
 * <BarChart items={[{ label: "gpt-4o", value: 120 }, { label: "haiku", value: 80 }]} />
 * ```
 */
export const BarChart = hostComponent<BarChartProps>("ztui-bar-chart");

/** Props for {@link LinePlot}. */
export interface LinePlotProps extends Omit<ComponentProps, "children"> {
  /** A single series (convenience for one line). */
  data?: number[];
  /** Multiple series; takes precedence over {@link data}. */
  series?: number[][];
  /** Per-series colours (theme `$var` or literal), cycled if shorter. */
  colors?: string[];
  /** Value-range floor (default the data minimum). */
  min?: number;
  /** Value-range ceiling (default the data maximum). */
  max?: number;
}

/**
 * A braille line plot — 2×4 dots per cell — for one or more numeric series over
 * a shared range. Fills whatever box it's given, down to a single cell.
 *
 * ```tsx
 * <LinePlot series={[p50, p99]} colors={["$accent", "$warning"]} style={{ height: 8 }} />
 * ```
 */
export const LinePlot = hostComponent<LinePlotProps>("ztui-line-plot");

/** Props for {@link ScatterPlot}. */
export interface ScatterPlotProps extends Omit<ComponentProps, "children"> {
  /** A single series of points (convenience for one cloud). */
  points?: ScatterPoint[];
  /** Multiple series; takes precedence over {@link ScatterPlotProps.points}. */
  series?: ScatterPoint[][];
  /** Per-series colours (theme `$var` or literal), cycled if shorter. */
  colors?: string[];
  /** X-axis floor / ceiling (default the data range). */
  minX?: number;
  maxX?: number;
  /** Y-axis floor / ceiling (default the data range). */
  minY?: number;
  maxY?: number;
}

/**
 * A braille scatter plot — `{x, y}` points drawn without connecting lines, so
 * the x position is meaningful. Auto-ranges both axes unless pinned.
 *
 * ```tsx
 * <ScatterPlot points={[{ x: 1, y: 2 }, { x: 3, y: 5 }]} style={{ height: 8 }} />
 * ```
 */
export const ScatterPlot = hostComponent<ScatterPlotProps>("ztui-scatter-plot");

/** Props for {@link AreaChart}. */
export interface AreaChartProps extends Omit<ComponentProps, "children"> {
  /** A single series (convenience for one area). */
  data?: number[];
  /** Multiple series; takes precedence over {@link AreaChartProps.data}. */
  series?: number[][];
  /** Per-series colours (theme `$var` or literal), cycled if shorter. */
  colors?: string[];
  /** Value-range floor (default 0) / ceiling (default the data maximum). */
  min?: number;
  max?: number;
}

/**
 * A braille area chart — a line plot with the region below each series filled,
 * for cumulative/volume trends. Series paint in order (later over earlier).
 *
 * ```tsx
 * <AreaChart data={requestsPerMinute} colors={["$accent"]} style={{ height: 8 }} />
 * ```
 */
export const AreaChart = hostComponent<AreaChartProps>("ztui-area-chart");

/** Props for {@link PieChart}. */
export interface PieChartProps extends Omit<ComponentProps, "children"> {
  /** Slices to chart (label + value, optional colour). */
  items: PieSlice[];
  /** Show the percentage legend below the bar. Default true. */
  showLegend?: boolean;
}

/**
 * A proportional breakdown drawn as a 100%-stacked horizontal bar with a
 * percentage legend — the terminal-friendly stand-in for a pie chart, crisp at
 * any width.
 *
 * ```tsx
 * <PieChart items={[{ label: "used", value: 70 }, { label: "free", value: 30 }]} />
 * ```
 */
export const PieChart = hostComponent<PieChartProps>("ztui-pie-chart");
