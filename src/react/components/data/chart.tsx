import type { BarChartItem } from "../../../widgets/data/chart.ts";
import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export type { BarChartItem };

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
