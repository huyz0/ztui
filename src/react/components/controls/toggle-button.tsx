import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

/** Props for {@link ToggleButton}. */
export interface ToggleButtonProps extends ComponentProps {
  /** Pressed/active state (controlled). */
  active?: boolean;
  /** Button text. */
  label?: string;
  /** Called with the new state when toggled. */
  onChange?: (active: boolean) => void;
  /** Also fired on activation, if you need the raw event. */
  onClick?: (ev: any) => void;
}

/** A button with a sticky pressed state (toolbar-style toggle). */
export const ToggleButton = hostComponent<ToggleButtonProps>("ztui-toggle-button");
