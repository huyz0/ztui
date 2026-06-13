import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export type WaitingGridCells = 4 | 9;
export type WaitingGridVariant = "ring" | "radar" | "shimmer";

export interface WaitingGridProps extends ComponentProps {
  /** Total dots: 4 (2×2) or 9 (3×3). Defaults to 9. */
  cells?: WaitingGridCells;
  /** Milliseconds for one full animation cycle. Defaults to 1000. */
  period?: number;
  /** Motion style: rotating crest, radar sweep, or diagonal shimmer. Defaults to `ring`. */
  variant?: WaitingGridVariant;
}

/**
 * A multi-cell waiting indicator: a square of dots animated by colour alone —
 * a rotating crest, a radar sweep with afterglow, or a sliding shimmer band.
 * Sized for screen- or panel-level "please wait" states. Animates on its own
 * from the render clock.
 */
export const WaitingGrid = hostComponent<WaitingGridProps>("ztui-waiting-grid");
