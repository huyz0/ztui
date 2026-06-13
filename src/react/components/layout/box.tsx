import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface BoxProps extends ComponentProps {
  /**
   * Optional label painted into the top border edge as `─ title ─`. Only shows
   * when the box has a visible border; inherits the border color and truncates
   * with `…` when wider than the box.
   */
  title?: string;
}

export const Box = hostComponent<BoxProps>("ztui-box");
