import type { ComponentProps } from "./types.ts";

export interface CheckboxProps extends ComponentProps {
  checked?: boolean;
  label?: string;
  onChange?: (val: boolean) => void;
}

export function Checkbox({
  id,
  className,
  style,
  checked,
  label,
  onChange,
  ...rest
}: CheckboxProps) {
  return (
    <ztui-checkbox
      id={id}
      className={className}
      style={style}
      checked={checked}
      label={label}
      onChange={onChange}
      {...rest}
    />
  );
}
