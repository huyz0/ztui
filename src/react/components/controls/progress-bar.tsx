import type { ReactElement } from "react";
import type { Easing } from "../../../core/easing.ts";
import { useAnimatedValue } from "../../use-animation.ts";
import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface ProgressBarProps extends ComponentProps {
  /** Current progress, interpreted within [min, max]. */
  value?: number;
  min?: number;
  max?: number;
  /** Append a right-aligned `100%` readout after the bar. */
  showPercent?: boolean;
  /** Animate a sweeping segment instead of showing a fixed fill. */
  indeterminate?: boolean;
  /**
   * Tween the fill when `value` changes instead of snapping. Pass a number for a
   * custom duration in ms (default 300 when `true`). Ignored for `indeterminate`
   * bars, which run their own sweep.
   */
  animate?: boolean | number;
  /** Easing curve for the {@link animate} tween. Defaults to `out-cubic`. */
  animateEasing?: Easing;
}

const ProgressBarHost = hostComponent<ProgressBarProps>("ztui-progress-bar");

/**
 * A horizontal progress bar. With `animate`, a change to `value` sweeps to the
 * new fill rather than jumping — pleasant for steppy or bursty progress (a
 * download that arrives in chunks, a multi-stage task).
 */
export function ProgressBar({
  animate,
  animateEasing,
  value = 0,
  indeterminate,
  ...props
}: ProgressBarProps): ReactElement {
  // Hooks must run unconditionally; when animation is off (or the bar is
  // indeterminate) we simply ignore the tweened value and forward `value` as-is.
  const duration = typeof animate === "number" ? animate : 300;
  const tweened = useAnimatedValue(value, { duration, easing: animateEasing });
  const shown = animate && !indeterminate ? tweened : value;
  return <ProgressBarHost value={shown} indeterminate={indeterminate} {...props} />;
}

export interface CompactProgressBarProps extends ProgressBarProps {}

/**
 * A 5-cell-wide progress bar for tight layouts (table cells, status lines). The
 * solid-block colour fill keeps it legible even at this width; a caller `width`
 * in `style` still wins if a different size is needed.
 *
 * When `showPercent` is set, the default width grows by the 5 columns the
 * ` 100%` readout needs, so the bar itself stays a full 5 cells rather than
 * being squeezed by the text.
 */
export function CompactProgressBar({ style, ...props }: CompactProgressBarProps) {
  const width = props.showPercent ? 10 : 5;
  return <ProgressBar style={{ width, ...style }} {...props} />;
}
