import type { RadioOption } from "../../../widgets/controls/radio-group.ts";
import { hostComponent } from "../factory.tsx";
import type { ComponentProps, FieldValidationProps } from "../types.ts";

/** Props for {@link RadioGroup}. */
export interface RadioGroupProps extends ComponentProps, FieldValidationProps {
  /** Choices — plain strings or `{ value, label }` objects. */
  options: (string | RadioOption)[];
  /** The selected value. */
  value?: string;
  /** Layout direction (default `"vertical"`). */
  orientation?: "horizontal" | "vertical";
  /** Called with the newly selected value. */
  onChange?: (val: string) => void;
}

/** A single-choice group of radio options. */
export const RadioGroup = hostComponent<RadioGroupProps>("ztui-radio-group");
