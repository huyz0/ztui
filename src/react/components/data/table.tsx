import { createElement, type ReactElement } from "react";
import type { SortState, TableColumn } from "../../../widgets/data/table.ts";
import type { ComponentProps } from "../types.ts";

export interface TableProps<Row = any> extends Omit<ComponentProps, "children"> {
  /** Source rows. Only the visible window is ever rendered (virtualized). */
  data: Row[];
  columns: TableColumn<Row>[];
  rowHeight?: number;
  showHeader?: boolean;
  /** Selected row in display order, or -1. */
  selectedIndex?: number;
  /** Active sort. Controlled when `onSortChange` is provided. */
  sort?: SortState | null;
  onSelect?: (row: Row, viewIndex: number) => void;
  onSortChange?: (sort: SortState | null) => void;
}

export function Table<Row = any>(props: TableProps<Row>): ReactElement {
  return createElement("ztui-table", props);
}
Table.displayName = "Table";
