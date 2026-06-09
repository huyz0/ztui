import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface MermaidProps extends ComponentProps {}

export const Mermaid = hostComponent<MermaidProps>("ztui-mermaid");
