import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

/** A coloured severity band: the fill takes this colour at/after `at` (value units). */
export interface GaugeThreshold {
  /** Lower bound of the band, in value units. */
  at: number;
  /** Band colour (theme `$var` or literal). */
  color: string;
}

/** Props for {@link Gauge}. */
export interface GaugeProps extends ComponentProps {
  /** Current value. */
  value?: number;
  /** Scale floor (0% point). Default 0. */
  min?: number;
  /** Scale ceiling (100% point). Default 100. */
  max?: number;
  /** Optional label shown before the bar. */
  label?: string;
  /** Unit for the readout (e.g. `%`, `MB`); when unset the readout is a percentage. */
  unit?: string;
  /** Print the value readout after the bar. Default true. */
  showValue?: boolean;
  /** Severity bands; the fill colours by the band each cell falls in. */
  thresholds?: GaugeThreshold[];
  /** Base fill colour when no threshold applies. Default `$accent`. */
  color?: string;
}

/**
 * A single-value meter — a labelled bar coloured by severity {@link thresholds}
 * (green → amber → red) with a value readout. For utilization/quota/score
 * signals (CPU, disk, rate limits) where the *level* carries meaning, unlike a
 * plain ProgressBar which only shows progress in one colour.
 *
 * ```tsx
 * <Gauge label="CPU" value={82} unit="%"
 *   thresholds={[{ at: 0, color: "$success" }, { at: 70, color: "$warning" }, { at: 90, color: "$error" }]} />
 * ```
 */
export const Gauge = hostComponent<GaugeProps>("ztui-gauge");
