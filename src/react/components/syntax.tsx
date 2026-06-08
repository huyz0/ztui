import type { ComponentProps } from "./types.ts";

export interface SyntaxProps extends ComponentProps {
  language?: string;
  lineNumbers?: boolean;
}

export function Syntax({
  id,
  className,
  style,
  children,
  language,
  lineNumbers,
  theme,
  ...rest
}: SyntaxProps) {
  return (
    <ztui-syntax
      id={id}
      className={className}
      style={style}
      language={language}
      lineNumbers={lineNumbers}
      theme={theme}
      {...rest}
    >
      {children}
    </ztui-syntax>
  );
}
