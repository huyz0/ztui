import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface LabelProps extends ComponentProps {
  /**
   * Parse the text as console markup (e.g. `[bold red]hi[/]`,
   * `[undercurl underline=red]typo[/]`) instead of plain text. Off by default,
   * so existing labels render their literal `[...]` text unchanged.
   */
  markup?: boolean;
}

/** Styled inline text. */
export const Label = hostComponent<LabelProps>("ztui-label");
