import type React from "react";
import type { ComponentProps } from "./types.ts";

export function Header({ id, className, style, children }: ComponentProps) {
  return (
    <ztui-header id={id} className={className} style={style}>
      {children}
    </ztui-header>
  );
}
