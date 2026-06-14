import type { SelectOption } from "../../../widgets/controls/select.ts";
import { hostComponent } from "../factory.tsx";
import type { ComponentProps, FieldValidationProps } from "../types.ts";

/** Props for {@link Select}. */
export interface SelectProps extends ComponentProps, FieldValidationProps {
  /** Choices — plain strings or `{ value, label }` objects. */
  options: (string | SelectOption)[];
  /** Selected value, or array of values when `multiple`. */
  value?: string | string[];
  /** Allow selecting multiple options. */
  multiple?: boolean;
  /** Called with the new selection (string, or string[] when `multiple`). */
  onChange?: (val: any) => void;
  /** Hint text shown when nothing is selected. */
  placeholder?: string;
}

/** A single- or multi-select dropdown. */
export const Select = hostComponent<SelectProps>("ztui-select");
