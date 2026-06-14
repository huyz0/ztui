import { hostComponent } from "../factory.tsx";
import type { ComponentProps, FieldValidationProps } from "../types.ts";

/** Props for {@link Switch}. */
export interface SwitchProps extends ComponentProps, FieldValidationProps {
  /** On/off state (controlled). */
  active?: boolean;
  /** Text shown beside the switch. */
  label?: string;
  /** Called with the new state when toggled. */
  onChange?: (val: boolean) => void;
}

/** An on/off toggle switch. */
export const Switch = hostComponent<SwitchProps>("ztui-switch");
