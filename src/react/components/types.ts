import type React from "react";
import type { WidgetStyles } from "../../dom/widget.ts";

export interface ComponentProps {
  id?: string;
  className?: string;
  style?: WidgetStyles;
  theme?: string;
  children?: React.ReactNode;
  onMouseEnter?: (ev: any) => void;
  onMouseLeave?: (ev: any) => void;
}
