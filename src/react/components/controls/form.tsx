import type { FormMessageMode } from "../../../widgets/controls/form.ts";
import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface FormProps extends ComponentProps {
  /**
   * How field error messages are surfaced. `auto`/`shared` (default) show one
   * bottom status line for the focused field — frugal on terminal rows;
   * `inline` defers to `<FieldError>` widgets; `none` uses border color only.
   */
  messageMode?: FormMessageMode;
  /** Fired with `{ [fieldId]: value }` only when every field validates. */
  onSubmit?: (values: Record<string, unknown>) => void;
  /** Fired after a full-form validation pass (e.g. on submit). */
  onValidate?: (valid: boolean, values: Record<string, unknown>) => void;
}

/** A validating container that aggregates its child fields. */
export const Form = hostComponent<FormProps>("ztui-form");
