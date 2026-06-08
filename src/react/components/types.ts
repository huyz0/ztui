import type React from "react";
import type { WidgetStyles } from "../../dom/widget.ts";

export interface ComponentProps {
  id?: string;
  className?: string;
  style?: WidgetStyles;
  theme?: string;
  label?: string;
  children?: React.ReactNode;
  focusable?: boolean;
  onClick?: (ev: any) => void;
  onKey?: (ev: any) => void;
  onScroll?: (ev: any) => void;
  onMouseEnter?: (ev: any) => void;
  onMouseLeave?: (ev: any) => void;
}
