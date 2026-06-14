import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

/** Props for {@link Image}. */
export interface ImageProps extends ComponentProps {
  /** Path or URL to a raster image. */
  src?: string;
  /** Raw encoded image bytes (alternative to `src`). */
  buffer?: Uint8Array;
  /** Force Unicode half-block rendering instead of a graphics protocol. */
  ansi?: boolean;
}

/** An inline raster image with graceful fallback to half-block art. */
export const Image = hostComponent<ImageProps>("ztui-image");
