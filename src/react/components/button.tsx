import type { ComponentProps } from "./types.ts";

export interface ButtonProps extends ComponentProps {
  onClick?: (ev: any) => void;
}

export function Button({ id, className, style, onClick, children, ...rest }: ButtonProps) {
  return (
    <ztui-button id={id} className={className} style={style} onClick={onClick} {...rest}>
      {children}
    </ztui-button>
  );
}
