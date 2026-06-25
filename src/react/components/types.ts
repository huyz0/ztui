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

/** Props shared by every ztui React component (plus each component's own props). */
export interface ComponentProps {
  /** Stable identifier, handy for tests and lookups. */
  id?: string;
  /** Space-separated class names (currently advisory; no CSS cascade). */
  className?: string;
  /**
   * Captures the underlying widget instance (React 19 ref-as-prop). Defaults to
   * the base `Widget`; narrow it with a cast when you need a subclass field,
   * e.g. `ref={inputRef as React.Ref<InputWidget>}`.
   */
  ref?: React.Ref<Widget>;
  /** Inline styles for this widget — see the Styling guide. */
  style?: WidgetStyles;
  /** Re-theme this subtree; descendants resolve `$tokens` against it. */
  theme?: string;
  /** Structural/accessible label (also the tab title inside `TabContainer`). */
  label?: string;
  /** Child elements. */
  children?: React.ReactNode;
  /** Allow this widget to take keyboard focus. */
  focusable?: boolean;
  /**
   * When a click lands on this container (its padding, border, or a non-focusable
   * child), move focus to its first focusable descendant — so clicking a
   * `Form`/`Panel`/`Box` hands focus to its first field. Off by default.
   */
  focusOnClick?: boolean;
  /**
   * Marks the widget (and its descendants) as inert: not focusable, ignores
   * key/mouse input, and interactive controls render in a muted style. A
   * disabled container propagates to every control inside it.
   */
  disabled?: boolean;
  /** Pointer click. */
  onClick?: (ev: any) => void;
  /** Pointer pressed (any button); the event carries `button` and `x`/`y`. */
  onMouseDown?: (ev: any) => void;
  /** Key event while focused; set `ev.handled` to consume it. */
  onKey?: (ev: any) => void;
  /** Wheel / scroll event. */
  onScroll?: (ev: any) => void;
  /** Pointer entered this widget's region. */
  onMouseEnter?: (ev: any) => void;
  /** Pointer left this widget's region. */
  onMouseLeave?: (ev: any) => void;
  /** Opt-in hint that this widget cares about passive hover movement. */
  hoverInterest?: boolean;
  /** Pointer-drag lifecycle; `moved` is false for a tap with no movement. */
  onDragStart?: (x: number, y: number) => void;
  /** Pointer moved while dragging from this widget. */
  onDragMove?: (x: number, y: number) => void;
  /** Drag released; `moved` is false for a tap with no movement. */
  onDragEnd?: (x: number, y: number, moved: boolean) => void;
}
