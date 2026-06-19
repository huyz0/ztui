import { createElement, type ReactElement, type ReactNode, useState } from "react";
import type { RowGroup } from "../../../widgets/data/grouping.ts";
import type { SortState, TableColumn, TableTextStyle } from "../../../widgets/data/table.ts";
import type { ComponentProps } from "../types.ts";

/** Props for {@link Table}. */
export interface TableProps<Row = any> extends Omit<ComponentProps, "children"> {
  /** Source rows. Only the visible window is ever rendered (virtualized). Ignored when `groups` is set. */
  data?: Row[];
  /**
   * Grouped mode: each group renders a non-interactive title row (spanning all
   * columns) followed by its rows; clicking a title collapses/expands it. When
   * set, `sort` and rich (`render`) cells are ignored — grouped tables are
   * text-only.
   */
  groups?: RowGroup<Row>[];
  /** A group was collapsed or expanded (grouped mode). */
  onToggleGroup?: (id: string, collapsed: boolean) => void;
  /** Column definitions (key, header, width, optional `render`). */
  columns: TableColumn<Row>[];
  /** Height of each row in cells (default 1). */
  rowHeight?: number;
  /** Show the header row (default true). */
  showHeader?: boolean;
  /** Header formatting. Bold by default; pass `{ bold: false }` for a plain header. */
  headerStyle?: TableTextStyle;
  /** Selected row in display order, or -1. */
  selectedIndex?: number;
  /** Active sort. Controlled when `onSortChange` is provided. */
  sort?: SortState | null;
  /** Selection changed (arrow navigation or single click). */
  onSelect?: (row: Row, viewIndex: number) => void;
  /** Row activated — Enter or double-click. */
  onActivate?: (row: Row, viewIndex: number) => void;
  /** Sort changed (column header clicked); makes `sort` controlled. */
  onSortChange?: (sort: SortState | null) => void;
}

interface Viewport {
  first: number;
  dataIndices: number[];
}

/**
 * Build the cell widgets for the visible window of every `render` column. Only
 * on-screen rows are materialized, so widget-bearing cells stay virtualized.
 */
function buildCells<Row>(columns: TableColumn<Row>[], data: Row[], vp: Viewport): ReactNode[] {
  const cells: ReactNode[] = [];
  for (let i = 0; i < vp.dataIndices.length; i++) {
    const dataIndex = vp.dataIndices[i];
    const viewRow = vp.first + i;
    const row = data[dataIndex];
    if (row === undefined) continue;
    for (const col of columns) {
      if (!col.render) continue;
      cells.push(
        createElement(
          "ztui-table-cell",
          { key: `${viewRow}:${col.key}`, viewRow, colKey: col.key },
          col.render(row, dataIndex) as ReactNode,
        ),
      );
    }
  }
  return cells;
}

/** A virtualized, sortable data grid. Renders only on-screen rows. */
export function Table<Row = any>(props: TableProps<Row>): ReactElement {
  const { data, columns, groups } = props;
  // Grouped tables are text-only, so skip the rich-cell viewport machinery.
  const hasRich = !groups && columns.some((c) => typeof c.render === "function");
  const [vp, setVp] = useState<Viewport>({ first: 0, dataIndices: [] });

  if (!hasRich) {
    return createElement("ztui-table", props);
  }

  // The widget reports which rows are on screen; we re-render their cells.
  const onViewportChange = (next: Viewport): void => {
    setVp((prev) =>
      prev.first === next.first && prev.dataIndices.join(",") === next.dataIndices.join(",")
        ? prev
        : next,
    );
  };

  return createElement(
    "ztui-table",
    { ...props, onViewportChange },
    ...buildCells(columns, data ?? [], vp),
  );
}
Table.displayName = "Table";
