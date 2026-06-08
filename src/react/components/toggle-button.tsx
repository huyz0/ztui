import type { ComponentProps } from "./types.ts";

export interface ToggleButtonProps extends ComponentProps {
  active?: boolean;
  label?: string;
  onChange?: (active: boolean) => void;
  onClick?: (ev: any) => void;
}

export function ToggleButton({
  id,
  className,
  style,
  active,
  label,
  onChange,
  onClick,
  ...rest
}: ToggleButtonProps) {
  return (
    <ztui-toggle-button
      id={id}
      className={className}
      style={style}
      active={active}
      label={label}
      onChange={onChange}
      onClick={onClick}
      {...rest}
    />
  );
}
