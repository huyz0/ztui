import type { ComponentProps } from "./types.ts";

export function View({ id, className, style, children, ...rest }: ComponentProps) {
  return (
    <ztui-view id={id} className={className} style={style} {...rest}>
      {children}
    </ztui-view>
  );
}
