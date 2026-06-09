import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface TabContainerProps extends ComponentProps {
  activeIndex?: number;
  onChange?: (index: number) => void;
}

export const TabContainer = hostComponent<TabContainerProps>("ztui-tabcontainer");
