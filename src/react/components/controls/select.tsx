import type { SelectOption } from "../../../widgets/controls/select.ts";
import { hostComponent } from "../factory.tsx";
import type { ComponentProps, FieldValidationProps } from "../types.ts";

export interface SelectProps extends ComponentProps, FieldValidationProps {
  options: (string | SelectOption)[];
  value?: string | string[];
  multiple?: boolean;
  onChange?: (val: any) => void;
  placeholder?: string;
}

export const Select = hostComponent<SelectProps>("ztui-select");
