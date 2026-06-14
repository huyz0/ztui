import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface MarkdownProps extends ComponentProps {
  onAction?: (actionName: string, eventData: any) => void;
}

/** Render (and optionally stream) Markdown with highlighted code. */
export const Markdown = hostComponent<MarkdownProps>("ztui-markdown");
