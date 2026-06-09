import type {
  ValidateTrigger,
  ValidationResult,
  Validator,
} from "../../../widgets/controls/validation.ts";
import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface TextAreaProps extends ComponentProps {
  onKey?: (ev: any) => void;
  value?: string;
  onChange?: (val: string) => void;
  placeholder?: string;
  lineNumbers?: boolean;
  language?: string;
  validators?: Validator[];
  validateOn?: ValidateTrigger;
  onValidate?: (result: ValidationResult) => void;
}

export const TextArea = hostComponent<TextAreaProps>("ztui-textarea");
