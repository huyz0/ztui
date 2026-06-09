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
}

export const ProgressBar = hostComponent<ProgressBarProps>("ztui-progress-bar");

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
