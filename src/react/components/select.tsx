import type { SelectOption } from "../../widgets/select.ts";
import type { ComponentProps } from "./types.ts";

export interface SelectProps extends ComponentProps {
  options: (string | SelectOption)[];
  value?: string | string[];
  multiple?: boolean;
  onChange?: (val: any) => void;
  placeholder?: string;
}

export function Select({
  id,
  className,
  style,
  options,
  value,
  multiple,
  onChange,
  placeholder,
  ...rest
}: SelectProps) {
  return (
    <ztui-select
      id={id}
      className={className}
      style={style}
      options={options}
      value={value}
      multiple={multiple}
      onChange={onChange}
      placeholder={placeholder}
      {...rest}
    />
  );
}
