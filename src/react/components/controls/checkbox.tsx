import { hostComponent } from "../factory.tsx";
import type { ComponentProps, FieldValidationProps } from "../types.ts";

/** Props for {@link Checkbox}. */
export interface CheckboxProps extends ComponentProps, FieldValidationProps {
  /** Checked state (controlled). */
  checked?: boolean;
  /** Text shown beside the box. */
  label?: string;
  /** Called with the new state when toggled. */
  onChange?: (val: boolean) => void;
}

/** A labelled boolean checkbox. */
export const Checkbox = hostComponent<CheckboxProps>("ztui-checkbox");
