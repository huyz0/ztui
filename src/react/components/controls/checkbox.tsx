import { hostComponent } from "../factory.tsx";
import type { ComponentProps, FieldValidationProps } from "../types.ts";

export interface CheckboxProps extends ComponentProps, FieldValidationProps {
  checked?: boolean;
  label?: string;
  onChange?: (val: boolean) => void;
}

export const Checkbox = hostComponent<CheckboxProps>("ztui-checkbox");
