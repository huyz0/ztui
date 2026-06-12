import { type ReactElement, type ReactNode, useRef, useState } from "react";
import type { Widget } from "../../../dom/widget.ts";
import { Box } from "./box.tsx";
import { Splitter } from "./splitter.tsx";

export type SplitDirection = "row" | "column";

/** A leaf pane holding arbitrary content. */
export interface SplitLeaf {
  type: "leaf";
  /** Stable id (useful for controlled trees / persistence). */
  id: string;
  content: ReactNode;
}

/** An internal node splitting its area into children along one axis. */
export interface SplitBranch {
  type: "split";
  direction: SplitDirection;
  children: SplitNode[];
  /** Per-child weights (any positive units); defaults to equal. */
  sizes?: number[];
}

export type SplitNode = SplitLeaf | SplitBranch;

export interface SplitViewProps {
  /** Initial tree (uncontrolled). Resizing mutates internal state. */
  root: SplitNode;
  /** Fired with a fresh tree whenever a splitter resizes a pane. */
  onChange?: (root: SplitNode) => void;
}

const MIN_CELLS = 3;

/**
 * A recursively splittable, drag-resizable pane grid (VSCode editor-grid model).
 * A `split` node lays its children along one axis with `fr`-weighted sizes and a
 * draggable {@link Splitter} between each pair; `leaf` nodes render content.
 * Splits nest arbitrarily, so a child can itself be a split in the other
 * direction. Sizes live in state, so resizes are pure tree mutations.
 */
export function SplitView({ root, onChange }: SplitViewProps): ReactElement {
  const [tree, setTree] = useState<SplitNode>(root);
  // Container widgets keyed by node path, so a splitter can read the live pixel
  // size of its parent to convert a cell delta into a weight delta.
  const containers = useRef(new Map<string, Widget>());

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
      onChange?.(next);
      return next;
    });
  };

  const renderNode = (node: SplitNode, path: number[]): ReactNode => {
    if (node.type === "leaf") {
      return <Box style={{ width: "100%", height: "100%" }}>{node.content}</Box>;
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
