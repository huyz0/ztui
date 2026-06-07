import type React from "react";
import type { ComponentProps } from "./types.ts";

export interface ButtonProps extends ComponentProps {
  onClick?: (ev: any) => void;
}

export function Button({ id, className, style, onClick, children }: ButtonProps) {
  return (
    <ztui-button id={id} className={className} style={style} onClick={onClick}>
      {children}
    </ztui-button>
  );
}
