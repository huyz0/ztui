import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";
import type { Widget } from "../../../dom/widget.ts";
import { Label } from "../text/label.tsx";
import { Box } from "./box.tsx";
import { Panel } from "./panel.tsx";
import { Splitter } from "./splitter.tsx";

/** Split axis: `row` (side-by-side) or `column` (stacked). */
export type SplitDirection = "row" | "column";

/** A leaf pane holding arbitrary content. */
export interface SplitLeaf {
  /** Node kind discriminant. */
  type: "leaf";
  /** Stable id (useful for controlled trees / persistence). */
  id: string;
  /** Optional header title; shown in the pane's flat header bar. */
  title?: string;
  /** The pane's content. */
  content: ReactNode;
}

/** An internal node splitting its area into children along one axis. */
export interface SplitBranch {
  /** Node kind discriminant. */
  type: "split";
  /** Axis the children are arranged along. */
  direction: SplitDirection;
  /** Child nodes (leaves or nested splits). */
  children: SplitNode[];
  /** Per-child weights (any positive units); defaults to equal. */
  sizes?: number[];
}

/** A node in a SplitView tree: a {@link SplitLeaf} or {@link SplitBranch}. */
export type SplitNode = SplitLeaf | SplitBranch;

/** A leaf with its ReactNode content stripped — JSON-serializable. */
export interface SerializedLeaf {
  /** Node kind discriminant. */
  type: "leaf";
  /** The leaf's id (rehydrate content from it). */
  id: string;
  /** Optional header title. */
  title?: string;
}

/** A split branch with serializable children — JSON-serializable. */
export interface SerializedBranch {
  /** Node kind discriminant. */
  type: "split";
  /** Axis the children are arranged along. */
  direction: SplitDirection;
  /** Serialized child nodes. */
  children: SerializedSplitNode[];
  /** Per-child weights. */
  sizes?: number[];
}

/** A SplitView tree without content: only structure, ids, and sizes. */
export type SerializedSplitNode = SerializedLeaf | SerializedBranch;

/** Props for {@link SplitView}. */
export interface SplitViewProps {
  /** Initial tree (uncontrolled). Resizing mutates internal state. */
  root: SplitNode;
  /** Fired with a fresh tree whenever the layout changes (resize/split/close). */
  onChange?: (root: SplitNode) => void;
  /**
   * Show a 1-row toolbar on each pane with split (`↔`/`↕`) and close (`✕`)
   * buttons. Split buttons appear only when {@link SplitViewProps.newPane} is
   * given; close appears whenever more than one pane remains.
   */
  controls?: boolean;
  /**
   * Builds the content for a freshly split-off pane, given the id of the pane
   * that was split. Required for the split buttons to do anything.
   */
  newPane?: (sourceId: string) => ReactNode;
}

const MIN_CELLS = 3;

/**
 * A recursively splittable, drag-resizable pane grid (VSCode editor-grid model).
 * A `split` node lays its children along one axis with `fr`-weighted sizes and a
 * draggable {@link Splitter} between each pair; `leaf` nodes render content.
 * Splits nest arbitrarily, so a child can itself be a split in the other
 * direction. Sizes live in state, so resizes are pure tree mutations.
 */
export function SplitView({ root, onChange, controls, newPane }: SplitViewProps): ReactElement {
  const [tree, setTree] = useState<SplitNode>(root);
  // Re-sync from a new `root` identity (e.g. the host restoring a previously
  // closed pane by passing back a cached tree). Without this, `root` is only
  // ever read on mount and every later prop change is silently ignored —
  // there'd be no way to reopen/reset short of remounting the whole view.
  const prevRootRef = useRef(root);
  if (root !== prevRootRef.current) {
    prevRootRef.current = root;
    setTree(root);
  }
  // Container widgets keyed by node path, so a splitter can read the live pixel
  // size of its parent to convert a cell delta into a weight delta.
  const containers = useRef(new Map<string, Widget>());
  // Monotonic counter for unique ids of split-off panes.
  const newPaneSeq = useRef(0);

  // Surface every layout change for persistence via an effect keyed on the
  // tree itself (mirrors Workbench's onLayoutChange), rather than calling
  // onChange as a side effect inside a setState updater — updaters must stay
  // pure (React may invoke one more than once per commit, e.g. StrictMode),
  // and calling onChange there would double-fire.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    onChange?.(tree);
  }, [tree, onChange]);

  const doSplit = (id: string, direction: SplitDirection) => {
    if (!newPane) return;
    const leaf: SplitLeaf = {
      type: "leaf",
      id: `${id}-${++newPaneSeq.current}`,
      content: newPane(id),
    };
    // Functional update so two split/close calls landing before React
    // flushes the first (e.g. a fast double-click) both apply against the
    // real up-to-date tree instead of the second silently discarding the
    // first (see Workbench.move()'s identical fix for the same footgun).
    setTree((prev) => splitLeaf(prev, id, direction, leaf));
  };

  const doClose = (id: string) => {
    setTree((prev) => (countLeaves(prev) <= 1 ? prev : closeLeaf(prev, id)));
  };

  const resizeAt = (path: number[], index: number, delta: number) => {
    const key = path.join(".");
    const container = containers.current.get(key);
    setTree((prev) => {
      const next = structuredCloneTree(prev);
      const node = nodeAt(next, path);
      if (!node || node.type !== "split") return prev;

      const sizes = node.sizes ?? node.children.map(() => 1);
      const total = sizes.reduce((a, b) => a + b, 0);
      const region = container?.region;
      const axisCells = region ? (node.direction === "row" ? region.width : region.height) : 0;
      const available = axisCells - (node.children.length - 1); // minus splitter cells
      if (available <= 0) return prev;

      const frPerCell = total / available;
      const dw = delta * frPerCell;
      const min = frPerCell * MIN_CELLS;
      const a = sizes[index] + dw;
      const b = sizes[index + 1] - dw;
      if (a < min || b < min) return prev; // refuse to crush a pane below the min

      const newSizes = [...sizes];
      newSizes[index] = a;
      newSizes[index + 1] = b;
      node.sizes = newSizes;
      return next;
    });
  };

  const canClose = countLeaves(tree) > 1;
  const renderNode = (node: SplitNode, path: number[]): ReactNode => {
    if (node.type === "leaf") {
      // Without controls or a title, render the content bare (no chrome).
      if (!controls && node.title === undefined) {
        return <Box style={{ width: "100%", height: "100%" }}>{node.content}</Box>;
      }
      // Otherwise use a flat Panel: the split/close glyphs ride in the header's
      // top-right corner. Each is its own clickable Label (clicks hit the leaf
      // widget, no bubbling).
      const actions = controls ? (
        <>
          {newPane && (
            <Label onClick={() => doSplit(node.id, "row")} style={{ width: 2, dim: true }}>
              ↔
            </Label>
          )}
          {newPane && (
            <Label onClick={() => doSplit(node.id, "column")} style={{ width: 2, dim: true }}>
              ↕
            </Label>
          )}
          {canClose && (
            <Label onClick={() => doClose(node.id)} style={{ width: 2, color: "$error" }}>
              ✕
            </Label>
          )}
        </>
      ) : undefined;
      return (
        <Panel title={node.title} actions={actions}>
          {node.content}
        </Panel>
      );
    }

    const sizes = node.sizes ?? node.children.map(() => 1);
    const isRow = node.direction === "row";
    const key = path.join(".");
    const items: ReactNode[] = [];

    node.children.forEach((child, i) => {
      // Structural key (from descendant leaf ids), so it's stable without
      // relying on the array index.
      const childKey = nodeKey(child);
      if (i > 0) {
        items.push(
          <Splitter
            key={`sep-${childKey}`}
            orientation={isRow ? "vertical" : "horizontal"}
            style={isRow ? { width: 1, height: "100%" } : { width: "100%", height: 1 }}
            onResize={(d) => resizeAt(path, i - 1, d)}
          />,
        );
      }
      const sizeStyle = isRow ? { width: `${sizes[i]}fr` } : { height: `${sizes[i]}fr` };
      items.push(
        <Box
          key={`pane-${childKey}`}
          style={isRow ? { ...sizeStyle, height: "100%" } : { ...sizeStyle, width: "100%" }}
        >
          {renderNode(child, [...path, i])}
        </Box>,
      );
    });

    return (
      <Box
        ref={(w: Widget | null) => {
          if (w) containers.current.set(key, w);
          else containers.current.delete(key);
        }}
        style={{
          width: "100%",
          height: "100%",
          layout: isRow ? "horizontal" : "vertical",
        }}
      >
        {items}
      </Box>
    );
  };

  return renderNode(tree, []) as ReactElement;
}

/** A stable structural key for a node, derived from its descendant leaf ids. */
function nodeKey(node: SplitNode): string {
  return node.type === "leaf" ? node.id : `(${node.children.map(nodeKey).join("|")})`;
}

/** Walk a path (child indices) to the node it addresses, or undefined. */
function nodeAt(root: SplitNode, path: number[]): SplitNode | undefined {
  let node: SplitNode | undefined = root;
  for (const i of path) {
    if (!node || node.type !== "split") return undefined;
    node = node.children[i];
  }
  return node;
}

/** Structural clone of the tree (content ReactNodes are shared by reference). */
function structuredCloneTree(node: SplitNode): SplitNode {
  if (node.type === "leaf") return { ...node };
  return {
    ...node,
    sizes: node.sizes ? [...node.sizes] : undefined,
    children: node.children.map(structuredCloneTree),
  };
}

/**
 * Strip a tree down to its serializable structure (ids/direction/sizes), dropping
 * the ReactNode content. Persist the result; rebuild with {@link hydrateSplit}.
 */
export function serializeSplit(node: SplitNode): SerializedSplitNode {
  if (node.type === "leaf") return { type: "leaf", id: node.id, title: node.title };
  return {
    type: "split",
    direction: node.direction,
    sizes: node.sizes ? [...node.sizes] : undefined,
    children: node.children.map(serializeSplit),
  };
}

/**
 * Rebuild a live tree from a serialized one, sourcing each leaf's content from
 * `contentFor(id)`. The inverse of {@link serializeSplit}.
 */
export function hydrateSplit(
  node: SerializedSplitNode,
  contentFor: (id: string) => ReactNode,
): SplitNode {
  if (node.type === "leaf")
    return { type: "leaf", id: node.id, title: node.title, content: contentFor(node.id) };
  return {
    type: "split",
    direction: node.direction,
    sizes: node.sizes ? [...node.sizes] : undefined,
    children: node.children.map((c) => hydrateSplit(c, contentFor)),
  };
}

/** Total number of leaf panes in a tree. */
export function countLeaves(node: SplitNode): number {
  return node.type === "leaf" ? 1 : node.children.reduce((n, c) => n + countLeaves(c), 0);
}

/**
 * Returns a new tree where the leaf `id` is replaced by a split of
 * `[originalLeaf, newLeaf]` along `direction` (equal sizes). Unchanged if the
 * id isn't found.
 */
export function splitLeaf(
  root: SplitNode,
  id: string,
  direction: SplitDirection,
  newLeaf: SplitLeaf,
): SplitNode {
  if (root.type === "leaf") {
    if (root.id !== id) return root;
    return { type: "split", direction, sizes: [1, 1], children: [root, newLeaf] };
  }
  return {
    ...root,
    children: root.children.map((c) => splitLeaf(c, id, direction, newLeaf)),
  };
}

/**
 * Returns a new tree with the leaf `id` removed. The containing split drops the
 * pane (and its size weight); a split left with a single child collapses into
 * that child. Returns the tree unchanged if removing `id` would empty it.
 */
export function closeLeaf(root: SplitNode, id: string): SplitNode {
  if (root.type === "leaf") return root; // can't remove the root leaf here
  const idx = root.children.findIndex((c) => c.type === "leaf" && c.id === id);
  if (idx >= 0) {
    const children = root.children.filter((_, i) => i !== idx);
    const sizes = root.sizes?.filter((_, i) => i !== idx);
    if (children.length === 1) return children[0]; // collapse single-child split
    return { ...root, children, sizes };
  }
  // Not a direct child: recurse, collapsing any split that became single-child.
  return {
    ...root,
    children: root.children.map((c) => closeLeaf(c, id)),
  };
}
