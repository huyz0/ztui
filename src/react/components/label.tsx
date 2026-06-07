import type React from "react";
import type { ComponentProps } from "./types.ts";

export function Label({ id, className, style, children, ...rest }: ComponentProps) {
  return (
    <ztui-label id={id} className={className} style={style} {...rest}>
      {children}
    </ztui-label>
  );
}
