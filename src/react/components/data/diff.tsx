import { createElement, type ReactElement, useState } from "react";
import type { DiffView } from "../../../widgets/data/diff.ts";
import type { ComponentProps } from "../types.ts";

/** Props for {@link Diff}. */
export interface DiffProps extends Omit<ComponentProps, "children"> {
  /** The original ("before") text. */
  oldText: string;
  /** The updated ("after") text. */
  newText: string;
  /** Language for syntax highlighting of the lines. Defaults to "text". */
  language?: string;
  /** Controlled view. Omit to let the built-in toggle manage it. */
  view?: DiffView;
  /** Initial view when uncontrolled. Defaults to "unified". */
  defaultView?: DiffView;
  /** Fired with the requested view when the header toggle is clicked. */
  onViewChange?: (view: DiffView) => void;
  /** Show the clickable "Unified / Split" toggle header. Defaults to true. */
  showToggle?: boolean;
  /** Show old/new line-number gutters. Defaults to true. */
  lineNumbers?: boolean;
  /** Unchanged lines kept around each change; pass Infinity to show everything. Defaults to 3. */
  context?: number;
}

/**
 * A syntax-highlighted code diff — the view a coding agent shows when it
 * proposes a file edit. Computes a line diff between `oldText` and `newText`,
 * tints added/removed lines, and collapses long unchanged runs. A clickable
 * header toggle switches between unified and split layout.
 *
 * Works controlled (pass `view` + `onViewChange`) or uncontrolled (`defaultView`).
 *
 * ```tsx
 * <Diff language="ts" oldText={before} newText={after} />
 * ```
 */
export function Diff({
  view,
  defaultView = "unified",
  onViewChange,
  ...rest
}: DiffProps): ReactElement {
  const [internal, setInternal] = useState<DiffView>(defaultView);
  const isControlled = view !== undefined;
  const current = isControlled ? view : internal;

  const handleViewChange = (next: DiffView) => {
    if (!isControlled) setInternal(next);
    onViewChange?.(next);
  };

  return createElement("ztui-diff", { ...rest, view: current, onViewChange: handleViewChange });
}
Diff.displayName = "Diff";
