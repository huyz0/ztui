import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface TabContainerProps extends ComponentProps {
  /** Index of the active tab. */
  activeIndex?: number;
  /** Called with the new index when the tab changes. */
  onChange?: (index: number) => void;
  /** Allow dragging a tab header to reorder tabs. Defaults to `false`. */
  reorderable?: boolean;
  /**
   * Fired once when a drag-to-reorder ends at a different position than it
   * started. The tab headers are already reordered live for visual feedback
   * during the drag — reorder your own tab data in this callback so the new
   * order survives the next render.
   */
  onReorder?: (fromIndex: number, toIndex: number) => void;
}

/** Tabbed container showing one panel at a time. */
export const TabContainer = hostComponent<TabContainerProps>("ztui-tabcontainer");
