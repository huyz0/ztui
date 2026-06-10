import type React from "react";
import type { Widget, WidgetStyles } from "../../dom/widget.ts";
import type {
  ValidateTrigger,
  ValidationResult,
  Validator,
} from "../../widgets/controls/validation.ts";

/** Validation props shared by every form control. */
export interface FieldValidationProps {
  /** Validators run on this field; failures recolor the control by severity. */
  validators?: Validator[];
  /** When the field re-validates itself (default "blur"). */
  validateOn?: ValidateTrigger;
  /** Called after each validation with the normalized result. */
  onValidate?: (result: ValidationResult) => void;
}

export interface ComponentProps {
  id?: string;
  className?: string;
  /**
   * Captures the underlying widget instance (React 19 ref-as-prop). Defaults to
   * the base `Widget`; narrow it with a cast when you need a subclass field,
   * e.g. `ref={inputRef as React.Ref<InputWidget>}`.
   */
  ref?: React.Ref<Widget>;
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
