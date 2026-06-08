import "react";
import type { WidgetStyles } from "../dom/widget.ts";

declare global {
  namespace React {
    namespace JSX {
      interface ZTUIElementProps {
        style?: WidgetStyles;
        className?: string;
        id?: string;
        theme?: string;
        label?: string;
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
          placeholder?: string;
          type?: "text" | "password" | "email";
          icon?: string;
          suffixIcon?: string;
          invalid?: boolean;
        };
        "ztui-textarea": ZTUIElementProps & {
          onKey?: (ev: any) => void;
          value?: string;
          onChange?: (val: string) => void;
          placeholder?: string;
          lineNumbers?: boolean;
          language?: string;
        };
        "ztui-header": ZTUIElementProps;
        "ztui-footer": ZTUIElementProps;
        "ztui-vbox": ZTUIElementProps;
        "ztui-hbox": ZTUIElementProps;
        "ztui-grid": ZTUIElementProps;
        "ztui-dock": ZTUIElementProps;
        "ztui-box": ZTUIElementProps;
        "ztui-scrollable-box": ZTUIElementProps;
        "ztui-icon": ZTUIElementProps & {
          name: string;
        };
        "ztui-image": ZTUIElementProps & {
          src?: string;
          buffer?: Uint8Array;
          ansi?: boolean;
        };
        "ztui-svgimage": ZTUIElementProps & {
          src?: string;
          ansi?: boolean;
        };
        "ztui-richtext": ZTUIElementProps;
        "ztui-syntax": ZTUIElementProps & {
          language?: string;
          lineNumbers?: boolean;
        };
        "ztui-markdown": ZTUIElementProps & {
          onAction?: (actionName: string, eventData: any) => void;
        };
        "ztui-jsonui": ZTUIElementProps & {
          onAction?: (actionName: string, eventData: any) => void;
        };
        "ztui-mermaid": ZTUIElementProps;
        mermaid: ZTUIElementProps;
        "ztui-select": ZTUIElementProps & {
          options: any[];
          value?: any;
          multiple?: boolean;
          onChange?: (val: any) => void;
          placeholder?: string;
        };
        "ztui-radio-group": ZTUIElementProps & {
          options: any[];
          value?: string;
          orientation?: "horizontal" | "vertical";
          onChange?: (val: string) => void;
        };
        "ztui-checkbox": ZTUIElementProps & {
          checked?: boolean;
          label?: string;
          onChange?: (val: boolean) => void;
        };
        "ztui-switch": ZTUIElementProps & {
          active?: boolean;
          label?: string;
          onChange?: (val: boolean) => void;
        };
        "ztui-slider": ZTUIElementProps & {
          value?: number;
          min?: number;
          max?: number;
          step?: number;
          onChange?: (val: number) => void;
        };
        "ztui-toggle-button": ZTUIElementProps & {
          active?: boolean;
          label?: string;
          onChange?: (val: boolean) => void;
          onClick?: (ev: any) => void;
        };
        "ztui-tabcontainer": ZTUIElementProps & {
          activeIndex?: number;
          onChange?: (index: number) => void;
        };
        "ztui-file-icon": ZTUIElementProps & {
          extension?: string;
          filename?: string;
          isFolder?: boolean;
          languageId?: string;
        };
      }
    }
  }
}
