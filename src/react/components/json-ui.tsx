import type { ComponentProps } from "./types.ts";

export interface JSONUIProps extends ComponentProps {
  onAction?: (actionName: string, eventData: any) => void;
}

export function JSONUI({ id, className, style, children, onAction, ...rest }: JSONUIProps) {
  return (
    <ztui-jsonui id={id} className={className} style={style} onAction={onAction} {...rest}>
      {children}
    </ztui-jsonui>
  );
}
