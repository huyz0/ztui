import type { ComponentProps } from "./types.ts";

export function Footer({ id, className, style, children, ...rest }: ComponentProps) {
  return (
    <ztui-footer id={id} className={className} style={style} {...rest}>
      {children}
    </ztui-footer>
  );
}
