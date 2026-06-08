import type { ComponentProps } from "./types.ts";

export interface MermaidProps extends ComponentProps {
  theme?: "ansi_dark" | "ansi_light";
}

export function Mermaid({ id, className, style, children, theme, ...rest }: MermaidProps) {
  return (
    <ztui-mermaid id={id} className={className} style={style} theme={theme} {...rest}>
      {children}
    </ztui-mermaid>
  );
}
