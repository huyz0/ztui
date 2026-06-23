import type {
  ValidateTrigger,
  ValidationResult,
  Validator,
} from "../../../widgets/controls/validation.ts";
import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

/** Props for {@link Input} — a single-line text field. */
export interface InputProps extends ComponentProps {
  /** Key handler (set `ev.handled` to consume). */
  onKey?: (ev: any) => void;
  /** Current text (controlled). */
  value?: string;
  /** Called with the new text on every edit. */
  onChange?: (val: string) => void;
  /** Called with the current text when Enter is pressed. */
  onSubmit?: (val: string) => void;
  /** Called when Escape is pressed — e.g. to cancel an inline editor. */
  onDismiss?: () => void;
  /** Hint text shown when empty. */
  placeholder?: string;
  /** Field type — `"password"` masks input, `"email"` adjusts validation/icon. */
  type?: "text" | "password" | "email";
  /** Leading icon name. */
  icon?: string;
  /** Trailing icon name. */
  suffixIcon?: string;
  /** Force the invalid (error) style regardless of validators. */
  invalid?: boolean;
  /** Validators run on this field; failures recolor the border/icon. */
  validators?: Validator[];
  /** When the field re-validates itself (default "blur"). */
  validateOn?: ValidateTrigger;
  /** Called after each validation with the normalized result. */
  onValidate?: (result: ValidationResult) => void;
}

/** A single-line text field with optional icons and validation. */
export const Input = hostComponent<InputProps>("ztui-input");

/** Props for {@link PasswordInput} ({@link InputProps} without `type`). */
export interface PasswordInputProps extends Omit<InputProps, "type"> {}

/** An {@link Input} preset to mask its value (`type="password"`). */
export function PasswordInput({ icon = "🔒", ...props }: PasswordInputProps) {
  return <Input type="password" icon={icon} {...props} />;
}

/** Props for {@link EmailInput} ({@link InputProps} without `type`). */
export interface EmailInputProps extends Omit<InputProps, "type"> {}

/** An {@link Input} preset for email entry (`type="email"`). */
export function EmailInput({ icon = "✉️", ...props }: EmailInputProps) {
  return <Input type="email" icon={icon} {...props} />;
}
