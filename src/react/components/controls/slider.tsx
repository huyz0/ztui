import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface SliderProps extends ComponentProps {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (val: number) => void;
}

export const Slider = hostComponent<SliderProps>("ztui-slider");
