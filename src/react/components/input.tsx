import type { ComponentProps } from "./types.ts";

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

export function Input({
  id,
  className,
  style,
  onKey,
  value,
  onChange,
  placeholder,
  type,
  icon,
  suffixIcon,
  invalid,
  children,
  ...rest
}: InputProps) {
  return (
    <ztui-input
      id={id}
      className={className}
      style={style}
      onKey={onKey}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type={type}
      icon={icon}
      suffixIcon={suffixIcon}
      invalid={invalid}
      {...rest}
    >
      {children}
    </ztui-input>
  );
}

export interface PasswordInputProps extends Omit<InputProps, "type"> {}

export function PasswordInput({ icon = "🔒", ...props }: PasswordInputProps) {
  return <Input type="password" icon={icon} {...props} />;
}

export interface EmailInputProps extends Omit<InputProps, "type"> {}

export function EmailInput({ icon = "✉️", ...props }: EmailInputProps) {
  return <Input type="email" icon={icon} {...props} />;
}
