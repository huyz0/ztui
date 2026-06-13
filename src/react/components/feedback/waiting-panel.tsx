import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export type WaitingPanelVariant = "ripple" | "orbit" | "rain";

export interface WaitingPanelProps extends ComponentProps {
  /** Motion style: expanding ripple, orbiting dots, or matrix rain (falling letter/digit streams). Defaults to `ripple`. */
  variant?: WaitingPanelVariant;
  /** Milliseconds for one full animation cycle. Defaults to 1400. */
  period?: number;
}

/**
 * A free-size waiting animation that fills its content area — concentric
 * ripples, orbiting dots, or matrix rain — for panels where the small
 * `WaitingGrid` would look lost. Pass `width`/`height` via `style` to size it;
 * it animates on its own from the render clock.
 */
export const WaitingPanel = hostComponent<WaitingPanelProps>("ztui-waiting-panel");
