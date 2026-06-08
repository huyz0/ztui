import type { ComponentProps } from "./types.ts";

export function ScrollableBox({ id, className, style, children, ...rest }: ComponentProps) {
  return (
    <ztui-scrollable-box id={id} className={className} style={style} {...rest}>
      {children}
    </ztui-scrollable-box>
  );
}
