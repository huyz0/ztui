import type { ComponentProps } from "./types.ts";

export interface TextAreaProps extends ComponentProps {
  onKey?: (ev: any) => void;
  value?: string;
  onChange?: (val: string) => void;
  placeholder?: string;
  lineNumbers?: boolean;
  language?: string;
}

export function TextArea({
  id,
  className,
  style,
  onKey,
  value,
  onChange,
  placeholder,
  lineNumbers,
  language,
  theme,
  children,
  ...rest
}: TextAreaProps) {
  return (
    <ztui-textarea
      id={id}
      className={className}
      style={style}
      onKey={onKey}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      lineNumbers={lineNumbers}
      language={language}
      theme={theme}
      {...rest}
    >
      {children}
    </ztui-textarea>
  );
}
