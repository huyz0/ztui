import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface SparklineProps extends Omit<ComponentProps, "children"> {
  /** The series to plot; each value becomes one bar. */
  data: number[];
  /** Low end of the value scale. Defaults to the data minimum. */
  min?: number;
  /** High end of the value scale. Defaults to the data maximum. */
  max?: number;
  /** Print the latest value after the bars. */
  showValue?: boolean;
}

/**
 * A one-row inline micro-chart (`▁`–`█`) for a stream of numbers — tokens/sec,
 * latency, cost — sized to `data.length` and showing the most recent values
 * when constrained narrower.
 *
 * ```tsx
 * <Sparkline data={[3, 5, 2, 8, 6, 9]} showValue />
 * ```
 */
export const Sparkline = hostComponent<SparklineProps>("ztui-sparkline");
