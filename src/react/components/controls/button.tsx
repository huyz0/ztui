import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface ButtonProps extends ComponentProps {
  onClick?: (ev: any) => void;
  /** Submits or resets the nearest ancestor `<Form>` when activated. */
  formAction?: "submit" | "reset";
}

export const Button = hostComponent<ButtonProps>("ztui-button");
