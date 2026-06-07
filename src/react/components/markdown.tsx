import type { ComponentProps } from "./types.ts";

export interface MarkdownProps extends ComponentProps {
  theme?: "ansi_dark" | "ansi_light";
}

export function Markdown({ id, className, style, children, theme, ...rest }: MarkdownProps) {
  return (
    <ztui-markdown id={id} className={className} style={style} theme={theme} {...rest}>
      {children}
    </ztui-markdown>
  );
}
