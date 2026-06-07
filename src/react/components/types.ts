import type React from "react";
import type { WidgetStyles } from "../../dom/widget.ts";

export interface ComponentProps {
  id?: string;
  className?: string;
  style?: WidgetStyles;
  children?: React.ReactNode;
}
