/**
 * Shared, pure helpers for the *grouped* mode of the row widgets (`ListView`,
 * `Table`). A grouped list is a flat sequence of **visual rows**: each group
 * contributes a non-interactive header row, followed — when the group is
 * expanded — by its item rows. Widgets virtualize, render, and navigate over
 * that array exactly as they do over their flat data; the only new branch is
 * "is this row a header?".
 *
 * Like {@link maxRowScrollTop} and the {@link selectionDeltaForKey} family,
 * everything here is stateless: each widget owns its own collapsed-id set,
 * selection, and scroll position.
 */

/** A named, collapsible group of rows for a grouped {@link ListView}/{@link Table}. */
export interface RowGroup<T> {
  /** Stable id; collapse state is keyed by this. */
  id: string;
  /** Title shown in the group's (non-interactive) header row. */
  title: string;
  /** The rows in this group, in display order. */
  items: T[];
  /** Start collapsed (seeds the initial, uncontrolled collapse state). */
  collapsed?: boolean;
}

/** One rendered line of a grouped list: a group header, or one item row. */
export type GroupedRow<T> =
  | {
      kind: "header";
      /** Index of the owning group in the source `groups` array. */
      groupIndex: number;
      /** The group's id (collapse key). */
      id: string;
      /** The group's title. */
      title: string;
      /** Whether the group is currently collapsed. */
      collapsed: boolean;
      /** Number of items in the group (shown dimmed after the title). */
      count: number;
    }
  | {
      kind: "item";
      /** Index of the owning group in the source `groups` array. */
      groupIndex: number;
      /** Index of this item within its group's `items` array. */
      itemIndex: number;
      /** The item itself. */
      item: T;
    };

/** The set of group ids that start collapsed, read from each group's `collapsed`. */
export function initialCollapsed<T>(groups: RowGroup<T>[]): Set<string> {
  const out = new Set<string>();
  for (const g of groups) if (g.collapsed) out.add(g.id);
  return out;
}

/**
 * Flatten `groups` into visual rows: a header per group, followed by its items
 * unless the group's id is in `collapsed`.
 */
export function buildGroupedRows<T>(
  groups: RowGroup<T>[],
  collapsed: ReadonlySet<string>,
): GroupedRow<T>[] {
  const rows: GroupedRow<T>[] = [];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const g = groups[groupIndex];
    const isCollapsed = collapsed.has(g.id);
    rows.push({
      kind: "header",
      groupIndex,
      id: g.id,
      title: g.title,
      collapsed: isCollapsed,
      count: g.items.length,
    });
    if (isCollapsed) continue;
    for (let itemIndex = 0; itemIndex < g.items.length; itemIndex++) {
      rows.push({ kind: "item", groupIndex, itemIndex, item: g.items[itemIndex] });
    }
  }
  return rows;
}

/**
 * The nearest item row (`kind: "item"`) at or after index `from`, stepping in
 * direction `dir` (+1 down / -1 up). Skips header rows; returns -1 when there
 * is no item row in that direction. The grouped analogue of ListView's
 * disabled-row skip loop.
 */
export function seekItemRow<T>(rows: GroupedRow<T>[], from: number, dir: number): number {
  const step = dir < 0 ? -1 : 1;
  for (let i = from; i >= 0 && i < rows.length; i += step) {
    if (rows[i].kind === "item") return i;
  }
  return -1;
}
