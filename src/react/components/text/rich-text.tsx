import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface RichTextProps extends ComponentProps {
  /**
   * Word-wrap the text to the content width instead of clipping a long line.
   * Off by default (intrinsic single-row sizing) to match inline-label behavior;
   * turn it on for flowing prose that should reflow to the available width.
   */
  wrap?: boolean;
}

/** Inline-markup styled text in a single element. */
export const RichText = hostComponent<RichTextProps>("ztui-richtext");
