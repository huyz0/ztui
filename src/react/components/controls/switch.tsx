import { hostComponent } from "../factory.tsx";
import type { ComponentProps, FieldValidationProps } from "../types.ts";

export interface SwitchProps extends ComponentProps, FieldValidationProps {
  active?: boolean;
  label?: string;
  onChange?: (val: boolean) => void;
}

export const Switch = hostComponent<SwitchProps>("ztui-switch");
