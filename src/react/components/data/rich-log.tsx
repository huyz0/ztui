import { createElement, type ReactElement } from "react";
import type { ComponentProps } from "../types.ts";

/** Props for {@link RichLog}. */
export interface RichLogProps extends Omit<ComponentProps, "children"> {
  /** Log entries as markup strings (same syntax as RichText); each may contain `\n`. */
  lines: string[];
  /** Max entries retained for layout; older entries drop off. Defaults to 10000. */
  maxLines?: number;
  /** Word-wrap entries to the content width. Defaults to true. */
  wrap?: boolean;
  /** Pin to the bottom as new lines arrive, until the user scrolls up. Defaults to true. */
  autoScroll?: boolean;
}

/**
 * A scrolling, append-only log panel for streaming text (agent output, tool
 * logs, reasoning traces). Virtualized like {@link ListView} and tails the
 * bottom until the user scrolls up.
 */
export function RichLog(props: RichLogProps): ReactElement {
  return createElement("ztui-richlog", props);
}
RichLog.displayName = "RichLog";
