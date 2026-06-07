import type React from "react";
import type { ComponentProps } from "./types.ts";

export interface ImageProps extends ComponentProps {
  src?: string;
  buffer?: Uint8Array;
}

export function Image({ id, className, style, src, buffer, ...rest }: ImageProps) {
  return (
    <ztui-image id={id} className={className} style={style} src={src} buffer={buffer} {...rest} />
  );
}
