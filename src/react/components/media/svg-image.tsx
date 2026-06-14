import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface SvgImageProps extends ComponentProps {
  /** SVG markup or path. */
  src?: string;
  /** Force Unicode half-block rendering. */
  ansi?: boolean;
}

/** Render an inline SVG image. */
export const SvgImage = hostComponent<SvgImageProps>("ztui-svgimage");
