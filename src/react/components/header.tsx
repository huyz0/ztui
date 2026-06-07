import type { ComponentProps } from "./types.ts";

export function Header({ id, className, style, children, ...rest }: ComponentProps) {
  return (
    <ztui-header id={id} className={className} style={style} {...rest}>
      {children}
    </ztui-header>
  );
}
