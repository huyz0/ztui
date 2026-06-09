import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface ToggleButtonProps extends ComponentProps {
  active?: boolean;
  label?: string;
  onChange?: (active: boolean) => void;
  onClick?: (ev: any) => void;
}

export const ToggleButton = hostComponent<ToggleButtonProps>("ztui-toggle-button");
