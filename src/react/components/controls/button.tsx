import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

/** Props for {@link Button}. */
export interface ButtonProps extends ComponentProps {
  /** Activation handler (click, Enter, or Space). */
  onClick?: (ev: any) => void;
  /** Submits or resets the nearest ancestor `<Form>` when activated. */
  formAction?: "submit" | "reset";
}

/** A clickable, focusable button. */
export const Button = hostComponent<ButtonProps>("ztui-button");
