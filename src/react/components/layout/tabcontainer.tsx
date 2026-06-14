import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface TabContainerProps extends ComponentProps {
  activeIndex?: number;
  onChange?: (index: number) => void;
}

/** Tabbed container showing one panel at a time. */
export const TabContainer = hostComponent<TabContainerProps>("ztui-tabcontainer");
