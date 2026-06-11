import { createElement, type ReactElement } from "react";
import type { DiffView } from "../../../widgets/data/diff.ts";
import type { ComponentProps } from "../types.ts";

export interface DiffProps extends Omit<ComponentProps, "children"> {
  /** The original ("before") text. */
  oldText: string;
  /** The updated ("after") text. */
  newText: string;
  /** Language for syntax highlighting of unchanged lines. Defaults to "text". */
  language?: string;
  /** Layout: "unified" (one column) or "split" (side-by-side). Defaults to "unified". */
  view?: DiffView;
  /** Show old/new line-number gutters. Defaults to true. */
  lineNumbers?: boolean;
  /** Unchanged lines kept around each change; pass Infinity to show everything. Defaults to 3. */
  context?: number;
}

/**
 * A syntax-highlighted code diff — the view a coding agent shows when it
 * proposes a file edit. Computes a line diff between `oldText` and `newText`,
 * tints added/removed lines, and collapses long unchanged runs.
 *
 * ```tsx
 * <Diff language="ts" oldText={before} newText={after} view="split" />
 * ```
 */
export function Diff(props: DiffProps): ReactElement {
  return createElement("ztui-diff", props);
}
Diff.displayName = "Diff";
