import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface ImageProps extends ComponentProps {
  src?: string;
  buffer?: Uint8Array;
  ansi?: boolean;
}

export const Image = hostComponent<ImageProps>("ztui-image");
