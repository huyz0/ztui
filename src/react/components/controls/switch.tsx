import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface SwitchProps extends ComponentProps {
  active?: boolean;
  label?: string;
  onChange?: (val: boolean) => void;
}

export const Switch = hostComponent<SwitchProps>("ztui-switch");
