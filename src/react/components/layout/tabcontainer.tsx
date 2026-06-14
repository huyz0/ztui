import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface TabContainerProps extends ComponentProps {
  /** Index of the active tab. */
  activeIndex?: number;
  /** Called with the new index when the tab changes. */
  onChange?: (index: number) => void;
}

/** Tabbed container showing one panel at a time. */
export const TabContainer = hostComponent<TabContainerProps>("ztui-tabcontainer");
