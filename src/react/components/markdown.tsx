import type { ComponentProps } from "./types.ts";

export interface MarkdownProps extends ComponentProps {
  theme?: "ansi_dark" | "ansi_light";
  onAction?: (actionName: string, eventData: any) => void;
}

export function Markdown({
  id,
  className,
  style,
  children,
  theme,
  onAction,
  ...rest
}: MarkdownProps) {
  return (
    <ztui-markdown
      id={id}
      className={className}
      style={style}
      theme={theme}
      onAction={onAction}
      {...rest}
    >
      {children}
    </ztui-markdown>
  );
}
