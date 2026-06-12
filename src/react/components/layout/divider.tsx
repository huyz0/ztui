import { createElement, type ReactElement } from "react";
import type { ComponentProps } from "../types.ts";

export interface DividerProps extends ComponentProps {
  orientation?: "vertical" | "horizontal";
}

/** A thin separator rule (`│`/`─`). See DividerWidget. */
export function Divider({ orientation = "vertical", ...props }: DividerProps): ReactElement {
  return createElement("ztui-divider", { orientation, ...props });
}
