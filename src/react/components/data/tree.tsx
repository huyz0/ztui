import { createElement, type ReactElement } from "react";
import type { TreeNode } from "../../../widgets/data/tree.ts";
import type { ComponentProps } from "../types.ts";

export interface TreeProps extends Omit<ComponentProps, "children"> {
  /** Forest of top-level nodes. A flat list needs no synthetic root. */
  data: TreeNode[];
  /** Present each root's children as the top level (hide the root nodes). */
  hideRoot?: boolean;
  rowHeight?: number;
  /** Expanded node ids. Controlled when `onExpandedChange` is provided. */
  expanded?: string[];
  /** Selected node id, or null. */
  selectedId?: string | null;
  /** Draw a dotted vertical guide line at each indentation level. */
  showGuides?: boolean;
  /** Color of the indentation guides. Subtle/muted by default. */
  guideColor?: string;
  /** Selection changed (arrow navigation or single click). */
  onSelect?: (node: TreeNode) => void;
  /** Item activated — Enter, Space, or double-click. */
  onActivate?: (node: TreeNode) => void;
  onToggle?: (node: TreeNode, expanded: boolean) => void;
  onExpandedChange?: (expanded: string[]) => void;
}

/**
 * Virtualized tree for workspace navigation. Only expanded, on-screen rows are
 * rendered, so it scales to large workspaces.
 */
export function Tree(props: TreeProps): ReactElement {
  return createElement("ztui-tree", props);
}
Tree.displayName = "Tree";
