import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface TerminalViewProps extends Omit<ComponentProps, "children"> {
  /** Full accumulated command output (ANSI allowed). Appended text streams in. */
  content?: string;
  /** Word-wrap long lines to the view width. Defaults to true. */
  wrap?: boolean;
  /** Pin to the bottom as output arrives, until the user scrolls up. Defaults to true. */
  autoScroll?: boolean;
  /** Lines retained in scrollback. Defaults to 5000. */
  maxLines?: number;
}

/**
 * A nested, scrollable terminal view for streamed command output. Renders ANSI
 * colors/styles and `\r` progress redraws, but is sandboxed — the escape bytes
 * are parsed into an internal grid and clipped to the widget, so child output
 * can never escape the viewport or corrupt the host app.
 *
 * ```tsx
 * <TerminalView content={shellOutput} style={{ height: 12, border: "round" }} />
 * ```
 */
export const TerminalView = hostComponent<TerminalViewProps>("ztui-terminal-view");
