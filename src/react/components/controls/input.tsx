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
