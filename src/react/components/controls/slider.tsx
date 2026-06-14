import { hostComponent } from "../factory.tsx";
import type { ComponentProps, FieldValidationProps } from "../types.ts";

/** Props for {@link Slider}. */
export interface SliderProps extends ComponentProps, FieldValidationProps {
  /** Current value (controlled). */
  value?: number;
  /** Minimum value (default 0). */
  min?: number;
  /** Maximum value (default 100). */
  max?: number;
  /** Increment per step (default 1). */
  step?: number;
  /** Called with the new value as it changes. */
  onChange?: (val: number) => void;
}

/** A numeric range slider. */
export const Slider = hostComponent<SliderProps>("ztui-slider");
