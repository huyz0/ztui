import type { RadioOption } from "../../widgets/radio-group.ts";
import type { ComponentProps } from "./types.ts";

export interface RadioGroupProps extends ComponentProps {
  options: (string | RadioOption)[];
  value?: string;
  orientation?: "horizontal" | "vertical";
  onChange?: (val: string) => void;
}

export function RadioGroup({
  id,
  className,
  style,
  options,
  value,
  orientation,
  onChange,
  ...rest
}: RadioGroupProps) {
  return (
    <ztui-radio-group
      id={id}
      className={className}
      style={style}
      options={options}
      value={value}
      orientation={orientation}
      onChange={onChange}
      {...rest}
    />
  );
}
