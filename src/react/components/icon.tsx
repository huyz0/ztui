import type React from "react";
import type { ComponentProps } from "./types.ts";

export interface IconProps extends ComponentProps {
  name: string;
}

export function Icon({ id, className, style, name, ...rest }: IconProps) {
  return <ztui-icon id={id} className={className} style={style} name={name} {...rest} />;
}
