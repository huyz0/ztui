import type {
  ValidateTrigger,
  ValidationResult,
  Validator,
} from "../../../widgets/controls/validation.ts";
import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface InputProps extends ComponentProps {
  onKey?: (ev: any) => void;
  value?: string;
  onChange?: (val: string) => void;
  placeholder?: string;
  type?: "text" | "password" | "email";
  icon?: string;
  suffixIcon?: string;
  invalid?: boolean;
  /** Validators run on this field; failures recolor the border/icon. */
  validators?: Validator[];
  /** When the field re-validates itself (default "blur"). */
  validateOn?: ValidateTrigger;
  /** Called after each validation with the normalized result. */
  onValidate?: (result: ValidationResult) => void;
}

export const Input = hostComponent<InputProps>("ztui-input");

export interface PasswordInputProps extends Omit<InputProps, "type"> {}

export function PasswordInput({ icon = "🔒", ...props }: PasswordInputProps) {
  return <Input type="password" icon={icon} {...props} />;
}

export interface EmailInputProps extends Omit<InputProps, "type"> {}

export function EmailInput({ icon = "✉️", ...props }: EmailInputProps) {
  return <Input type="email" icon={icon} {...props} />;
}
