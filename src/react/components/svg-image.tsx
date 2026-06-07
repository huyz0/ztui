import type { ComponentProps } from "./types.ts";

export interface SvgImageProps extends ComponentProps {
  src?: string;
  ansi?: boolean;
}

export function SvgImage({ id, className, style, src, ansi, ...rest }: SvgImageProps) {
  return (
    <ztui-svgimage id={id} className={className} style={style} src={src} ansi={ansi} {...rest} />
  );
}
