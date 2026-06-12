import "react";
import type { WidgetStyles } from "../dom/widget.ts";
import type { FormMessageMode } from "../widgets/controls/form.ts";
import type {
  ValidateTrigger,
  ValidationResult,
  Validator,
} from "../widgets/controls/validation.ts";

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
        onDragStart?: (x: number, y: number) => void;
        onDragMove?: (x: number, y: number) => void;
        onDragEnd?: (x: number, y: number, moved: boolean) => void;
      }

      interface IntrinsicElements {
        "ztui-view": ZTUIElementProps;
        "ztui-button": ZTUIElementProps & {
          onClick?: (ev: any) => void;
          formAction?: "submit" | "reset";
        };
        "ztui-form": ZTUIElementProps & {
          messageMode?: FormMessageMode;
          onSubmit?: (values: Record<string, unknown>) => void;
          onValidate?: (valid: boolean, values: Record<string, unknown>) => void;
        };
        "ztui-field-error": ZTUIElementProps & {
          targetId?: string;
        };
        "ztui-validation-summary": ZTUIElementProps & {
          formId?: string;
          title?: string;
          bullet?: string;
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
          validators?: Validator[];
          validateOn?: ValidateTrigger;
          onValidate?: (result: ValidationResult) => void;
        };
        "ztui-textarea": ZTUIElementProps & {
          onKey?: (ev: any) => void;
          value?: string;
          onChange?: (val: string) => void;
          placeholder?: string;
          lineNumbers?: boolean;
          language?: string;
          validators?: Validator[];
          validateOn?: ValidateTrigger;
          onValidate?: (result: ValidationResult) => void;
        };
        "ztui-header": ZTUIElementProps;
        "ztui-footer": ZTUIElementProps;
        "ztui-vbox": ZTUIElementProps;
        "ztui-hbox": ZTUIElementProps;
        "ztui-grid": ZTUIElementProps;
        "ztui-dock": ZTUIElementProps;
        "ztui-collapsible": ZTUIElementProps & {
          title: string;
          open?: boolean;
          onToggle?: (open: boolean) => void;
          glyphSet?: "unicode" | "ascii";
        };
        "ztui-box": ZTUIElementProps & {
          title?: string;
        };
        "ztui-splitter": ZTUIElementProps & {
          orientation?: "vertical" | "horizontal";
          onResize?: (delta: number) => void;
        };
        "ztui-scrollable-box": ZTUIElementProps & {
          title?: string;
        };
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
        "ztui-richlog": ZTUIElementProps & {
          lines: string[];
          maxLines?: number;
          wrap?: boolean;
          autoScroll?: boolean;
        };
        "ztui-syntax": ZTUIElementProps & {
          language?: string;
          lineNumbers?: boolean;
        };
        "ztui-sparkline": ZTUIElementProps & {
          data: number[];
          min?: number;
          max?: number;
          showValue?: boolean;
        };
        "ztui-selection-list": ZTUIElementProps & {
          items: import("../widgets/data/list-view.ts").ListItem[];
          value?: string[];
          onChange?: (selectedIds: string[]) => void;
          glyphSet?: "unicode" | "ascii";
        };
        "ztui-terminal-view": ZTUIElementProps & {
          content?: string;
          wrap?: boolean;
          autoScroll?: boolean;
          maxLines?: number;
        };
        "ztui-traceback": ZTUIElementProps & {
          error?: Error;
          name?: string;
          message?: string;
          stack?: string;
          showSource?: boolean;
          contextLines?: number;
        };
        "ztui-diff": ZTUIElementProps & {
          oldText: string;
          newText: string;
          language?: string;
          view?: "unified" | "split";
          onViewChange?: (view: "unified" | "split") => void;
          showToggle?: boolean;
          lineNumbers?: boolean;
          context?: number;
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
          validators?: Validator[];
          validateOn?: ValidateTrigger;
          onValidate?: (result: ValidationResult) => void;
        };
        "ztui-radio-group": ZTUIElementProps & {
          options: any[];
          value?: string;
          orientation?: "horizontal" | "vertical";
          onChange?: (val: string) => void;
          validators?: Validator[];
          validateOn?: ValidateTrigger;
          onValidate?: (result: ValidationResult) => void;
        };
        "ztui-checkbox": ZTUIElementProps & {
          checked?: boolean;
          label?: string;
          onChange?: (val: boolean) => void;
          validators?: Validator[];
          validateOn?: ValidateTrigger;
          onValidate?: (result: ValidationResult) => void;
        };
        "ztui-switch": ZTUIElementProps & {
          active?: boolean;
          label?: string;
          onChange?: (val: boolean) => void;
          validators?: Validator[];
          validateOn?: ValidateTrigger;
          onValidate?: (result: ValidationResult) => void;
        };
        "ztui-slider": ZTUIElementProps & {
          value?: number;
          min?: number;
          max?: number;
          step?: number;
          onChange?: (val: number) => void;
          validators?: Validator[];
          validateOn?: ValidateTrigger;
          onValidate?: (result: ValidationResult) => void;
        };
        "ztui-progress-bar": ZTUIElementProps & {
          value?: number;
          min?: number;
          max?: number;
          showPercent?: boolean;
          indeterminate?: boolean;
        };
        "ztui-spinner": ZTUIElementProps & {
          mode?: "rotate" | "bounce" | "blink" | "hex" | "quadrant" | "arc";
          interval?: number;
          frames?: string[];
        };
        "ztui-waiting-grid": ZTUIElementProps & {
          cells?: 4 | 9;
          period?: number;
          variant?: "ring" | "radar" | "shimmer";
        };
        "ztui-waiting-panel": ZTUIElementProps & {
          variant?: "ripple" | "orbit" | "rain";
          period?: number;
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
