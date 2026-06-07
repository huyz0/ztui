import type React from "react";
import type { ComponentProps } from "./types.ts";

export interface InputProps extends ComponentProps {
  onKey?: (ev: any) => void;
  value?: string;
  onChange?: (val: string) => void;
}

export function Input({ id, className, style, onKey, value, onChange, children }: InputProps) {
  return (
    <ztui-input
      id={id}
      className={className}
      style={style}
      onKey={onKey}
      value={value}
      onChange={onChange}
    >
      {children}
    </ztui-input>
  );
}
