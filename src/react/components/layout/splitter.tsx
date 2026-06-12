import { createElement, type ReactElement } from "react";
import type { ComponentProps } from "../types.ts";

export interface SplitterProps extends ComponentProps {
  orientation?: "vertical" | "horizontal";
  /** Pointer delta (cells) along the splitter's axis, emitted per drag step. */
  onResize?: (delta: number) => void;
}

/**
 * Draggable 1-cell separator for resizing docked regions. See SplitterWidget.
 */
export function Splitter({ orientation = "vertical", ...props }: SplitterProps): ReactElement {
  return createElement("ztui-splitter", { orientation, ...props });
}
