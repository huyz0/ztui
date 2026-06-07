import type React from "react";
import type { ComponentProps } from "./types.ts";

export function Box({ id, className, style, children, ...rest }: ComponentProps) {
  return (
    <ztui-box id={id} className={className} style={style} {...rest}>
      {children}
    </ztui-box>
  );
}
