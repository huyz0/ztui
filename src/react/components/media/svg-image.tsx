import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface SvgImageProps extends ComponentProps {
  src?: string;
  ansi?: boolean;
}

/** Render an inline SVG image. */
export const SvgImage = hostComponent<SvgImageProps>("ztui-svgimage");
