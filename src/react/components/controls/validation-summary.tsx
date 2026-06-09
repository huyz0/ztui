import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface ValidationSummaryProps extends ComponentProps {
  /** Bind to a specific form by id; defaults to the nearest ancestor form. */
  formId?: string;
  /** Optional heading shown above the messages when there are errors. */
  title?: string;
  /** Prefix glyph for each message row (default "• "). */
  bullet?: string;
}

export const ValidationSummary = hostComponent<ValidationSummaryProps>("ztui-validation-summary");
