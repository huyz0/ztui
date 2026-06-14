import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface SyntaxProps extends ComponentProps {
  /** Language id for highlighting. */
  language?: string;
  /** Show a line-number gutter. */
  lineNumbers?: boolean;
}

/** Syntax-highlighted code block. */
export const Syntax = hostComponent<SyntaxProps>("ztui-syntax");
