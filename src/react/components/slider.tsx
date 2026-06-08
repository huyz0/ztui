import type { ComponentProps } from "./types.ts";

export interface SliderProps extends ComponentProps {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (val: number) => void;
}

export function Slider({
  id,
  className,
  style,
  value,
  min,
  max,
  step,
  onChange,
  ...rest
}: SliderProps) {
  return (
    <ztui-slider
      id={id}
      className={className}
      style={style}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={onChange}
      {...rest}
    />
  );
}
