import { hostComponent } from "../factory.tsx";
import type { ComponentProps, FieldValidationProps } from "../types.ts";

/** Props for {@link DatePicker}. */
export interface DatePickerProps extends ComponentProps, FieldValidationProps {
  /** Selected date as `YYYY-MM-DD`, or `""`/omitted for no selection. */
  value?: string;
  /** Called with the new `YYYY-MM-DD` value when a day is committed. */
  onChange?: (value: string) => void;
  /** Hint text shown when nothing is selected. */
  placeholder?: string;
}

/** A single-date picker: a field that opens a calendar popover on activate. */
export const DatePicker = hostComponent<DatePickerProps>("ztui-date-picker");
