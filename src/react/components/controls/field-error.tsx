import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface FieldErrorProps extends ComponentProps {
  /**
   * Id of the field to report on. Omit to bind to the nearest preceding sibling
   * field. Renders nothing (zero height) while that field is valid.
   */
  targetId?: string;
}

/** Inline error message for a single field. */
export const FieldError = hostComponent<FieldErrorProps>("ztui-field-error");
