import "react";
import type { WidgetStyles } from "../dom/widget.ts";

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        "ztui-view": {
          style?: WidgetStyles;
          className?: string;
          id?: string;
          children?: React.ReactNode;
        };
        "ztui-button": {
          style?: WidgetStyles;
          className?: string;
          id?: string;
          onClick?: (ev: any) => void;
          children?: React.ReactNode;
        };
        "ztui-label": {
          style?: WidgetStyles;
          className?: string;
          id?: string;
          children?: React.ReactNode;
        };
        "ztui-input": {
          style?: WidgetStyles;
          className?: string;
          id?: string;
          onKey?: (ev: any) => void;
          value?: string;
          onChange?: (val: string) => void;
          children?: React.ReactNode;
        };
        "ztui-header": {
          style?: WidgetStyles;
          className?: string;
          id?: string;
          children?: React.ReactNode;
        };
        "ztui-footer": {
          style?: WidgetStyles;
          className?: string;
          id?: string;
          children?: React.ReactNode;
        };
        "ztui-vbox": {
          style?: WidgetStyles;
          className?: string;
          id?: string;
          children?: React.ReactNode;
        };
        "ztui-hbox": {
          style?: WidgetStyles;
          className?: string;
          id?: string;
          children?: React.ReactNode;
        };
        "ztui-grid": {
          style?: WidgetStyles;
          className?: string;
          id?: string;
          children?: React.ReactNode;
        };
        "ztui-dock": {
          style?: WidgetStyles;
          className?: string;
          id?: string;
          children?: React.ReactNode;
        };
        "ztui-box": {
          style?: WidgetStyles;
          className?: string;
          id?: string;
          children?: React.ReactNode;
        };
      }
    }
  }
}
