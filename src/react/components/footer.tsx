import type React from "react";
import type { ComponentProps } from "./types.ts";

export function Footer({ id, className, style, children }: ComponentProps) {
  return (
    <ztui-footer id={id} className={className} style={style}>
      {children}
    </ztui-footer>
  );
}
