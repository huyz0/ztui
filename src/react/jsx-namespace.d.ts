import "react";
import type { WidgetStyles } from "../dom/widget.ts";

declare global {
  namespace React {
    namespace JSX {
      interface ZTUIElementProps {
        style?: WidgetStyles;
        className?: string;
        id?: string;
        children?: React.ReactNode;
        onMouseEnter?: (ev: any) => void;
        onMouseLeave?: (ev: any) => void;
      }

      interface IntrinsicElements {
        "ztui-view": ZTUIElementProps;
        "ztui-button": ZTUIElementProps & {
          onClick?: (ev: any) => void;
        };
        "ztui-label": ZTUIElementProps;
        "ztui-input": ZTUIElementProps & {
          onKey?: (ev: any) => void;
          value?: string;
          onChange?: (val: string) => void;
        };
        "ztui-header": ZTUIElementProps;
        "ztui-footer": ZTUIElementProps;
        "ztui-vbox": ZTUIElementProps;
        "ztui-hbox": ZTUIElementProps;
        "ztui-grid": ZTUIElementProps;
        "ztui-dock": ZTUIElementProps;
        "ztui-box": ZTUIElementProps;
        "ztui-icon": ZTUIElementProps & {
          name: string;
        };
      }
    }
  }
}
