import type { ComponentProps } from "./types.ts";

export interface SwitchProps extends ComponentProps {
  active?: boolean;
  label?: string;
  onChange?: (val: boolean) => void;
}

export function Switch({ id, className, style, active, label, onChange, ...rest }: SwitchProps) {
  return (
    <ztui-switch
      id={id}
      className={className}
      style={style}
      active={active}
      label={label}
      onChange={onChange}
      {...rest}
    />
  );
}
