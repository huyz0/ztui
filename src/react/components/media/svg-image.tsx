import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface SvgImageProps extends ComponentProps {
  src?: string;
  ansi?: boolean;
}

export const SvgImage = hostComponent<SvgImageProps>("ztui-svgimage");
