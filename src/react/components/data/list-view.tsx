import { createElement, type ReactElement } from "react";
import type { RowGroup } from "../../../widgets/data/grouping.ts";
import type { ListItem } from "../../../widgets/data/list-view.ts";
import type { ComponentProps } from "../types.ts";

/** Props for {@link ListView}. */
export interface ListViewProps extends Omit<ComponentProps, "children"> {
  /** Items to display (flat mode). Ignored when `groups` is set. */
  items?: ListItem[];
  /**
   * Grouped mode: each group renders a non-interactive title row followed by
   * its items; clicking a title (or `←`/`→` on a row) collapses/expands it.
   */
  groups?: RowGroup<ListItem>[];
  /** A group was collapsed or expanded (grouped mode). */
  onToggleGroup?: (id: string, collapsed: boolean) => void;
  /** Height of each row in cells. */
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
