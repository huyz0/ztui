import type React from "react";
import type { ComponentProps } from "./types.ts";

export interface ImageProps extends ComponentProps {
  src?: string;
  buffer?: Uint8Array;
  ansi?: boolean;
}

export function Image({ id, className, style, src, buffer, ansi, ...rest }: ImageProps) {
  return (
    <ztui-image
      id={id}
      className={className}
      style={style}
      src={src}
      buffer={buffer}
      ansi={ansi}
      {...rest}
    />
  );
}
