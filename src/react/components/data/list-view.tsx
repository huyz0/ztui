import { createElement, type ReactElement } from "react";
import type { ListItem } from "../../../widgets/data/list-view.ts";
import type { ComponentProps } from "../types.ts";

/** Props for {@link ListView}. */
export interface ListViewProps extends Omit<ComponentProps, "children"> {
  items: ListItem[];
  rowHeight?: number;
  /** Selected item id, or null. */
  selectedId?: string | null;
  /** Background color painted across the selected row. */
  selectedBackground?: string;
  /** Color used for disabled rows and `detail` text. */
  mutedColor?: string;
  /** Selection changed (arrow navigation or single click). */
  onSelect?: (item: ListItem) => void;
  /** Item activated — Enter, Space, or double-click. */
  onActivate?: (item: ListItem) => void;
}

/**
 * Virtualized flat list with single selection. Only on-screen rows are
 * rendered, so it scales to very large lists.
 */
export function ListView(props: ListViewProps): ReactElement {
  return createElement("ztui-listview", props);
}
ListView.displayName = "ListView";
