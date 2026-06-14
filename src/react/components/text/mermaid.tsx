import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface MermaidProps extends ComponentProps {}

/** Render a Mermaid diagram. */
export const Mermaid = hostComponent<MermaidProps>("ztui-mermaid");
