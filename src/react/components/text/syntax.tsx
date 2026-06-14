import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface SyntaxProps extends ComponentProps {
  language?: string;
  lineNumbers?: boolean;
}

/** Syntax-highlighted code block. */
export const Syntax = hostComponent<SyntaxProps>("ztui-syntax");
