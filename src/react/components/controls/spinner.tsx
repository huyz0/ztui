import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export type SpinnerMode = "rotate" | "bounce" | "blink" | "hex" | "quadrant" | "arc";

export interface SpinnerProps extends ComponentProps {
  /** Animation style: twirl, hop, or fade. Defaults to `rotate`. */
  mode?: SpinnerMode;
  /** Milliseconds per frame (or pulse step). Defaults to 80. */
  interval?: number;
  /** Override the built-in frame glyphs entirely. */
  frames?: string[];
}

/**
 * A single-cell waiting indicator. Animates on its own from the render clock —
 * drop it inline next to a label or in a status line; no ticking prop needed.
 */
export const Spinner = hostComponent<SpinnerProps>("ztui-spinner");
