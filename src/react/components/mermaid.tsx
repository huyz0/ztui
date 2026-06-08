import type { ComponentProps } from "./types.ts";

export interface MermaidProps extends ComponentProps {}

export function Mermaid({ id, className, style, children, theme, ...rest }: MermaidProps) {
  return (
    <ztui-mermaid id={id} className={className} style={style} theme={theme} {...rest}>
      {children}
    </ztui-mermaid>
  );
}
