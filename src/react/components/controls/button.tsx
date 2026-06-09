import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface ButtonProps extends ComponentProps {
  onClick?: (ev: any) => void;
}

export const Button = hostComponent<ButtonProps>("ztui-button");
