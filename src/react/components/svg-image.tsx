import type React from "react";
import type { ComponentProps } from "./types.ts";

export interface SvgImageProps extends ComponentProps {
  src?: string;
}

export function SvgImage({ id, className, style, src, ...rest }: SvgImageProps) {
  return <ztui-svgimage id={id} className={className} style={style} src={src} {...rest} />;
}
