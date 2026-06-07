import type React from "react";
import type { ComponentProps } from "./types.ts";

export function View({ id, className, style, children }: ComponentProps) {
  return (
    <ztui-view id={id} className={className} style={style}>
      {children}
    </ztui-view>
  );
}
