import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface MarkdownProps extends ComponentProps {
  /** Called when an embedded action widget is activated. */
  onAction?: (actionName: string, eventData: any) => void;
  /**
   * Drop the final block's bottom margin so the text ends flush — no trailing
   * blank row. Handy inside an accent-barred container (a chat bubble).
   */
  trimTrailingMargin?: boolean;
  /**
   * Word-wrap prose (paragraphs, headings, list/quote bodies) to the viewport
   * width instead of overflowing into a horizontal scroll. Defaults to `true`.
   * Set `false` to keep long lines on one row (and scroll them horizontally).
   */
  wrap?: boolean;
}

/** Render (and optionally stream) Markdown with highlighted code. */
export const Markdown = hostComponent<MarkdownProps>("ztui-markdown");
