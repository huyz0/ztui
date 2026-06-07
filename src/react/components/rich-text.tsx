import type { ComponentProps } from "./types.ts";

export function RichText({ id, className, style, children, ...rest }: ComponentProps) {
  return (
    <ztui-richtext id={id} className={className} style={style} {...rest}>
      {children}
    </ztui-richtext>
  );
}
