import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface LabelProps extends ComponentProps {
  /**
   * Parse the text as console markup (e.g. `[bold red]hi[/]`,
   * `[undercurl underline=red]typo[/]`) instead of plain text. Off by default,
   * so existing labels render their literal `[...]` text unchanged.
   */
  markup?: boolean;
  /**
   * Word-wrap the text to the content width instead of keeping it on one row
   * (and clipping). Off by default. Applies to plain text only — markup labels
   * stay single-row.
   */
  wrap?: boolean;
}

/** Styled inline text. */
export const Label = hostComponent<LabelProps>("ztui-label");
