import type { DOMNode } from "../dom/dom.ts";
import { Widget } from "../dom/widget.ts";

/**
 * In-process DevTools data layer: serialize the live widget tree into a plain,
 * `Tree`-compatible shape and read a selected widget's detail. Pure functions
 * over the DOM tree, so the in-app overlay and (later) a browser panel share one
 * source of truth, alongside the HTTP {@link startInspector} backend.
 */

/** A node in the serialized widget tree (shape-compatible with `TreeNode`). */
export interface DevToolsNode {
  /** Path id, stable within one snapshot (e.g. `"0/2/1"`); resolves to a widget. */
  id: string;
  /** Display label: `tagName #id .class`. */
  label: string;
  /** The widget's tag (e.g. `"button"`). */
  tagName: string;
  /** Child nodes (text nodes are omitted — their text shows in the parent detail). */
  children: DevToolsNode[];
}

/** One `term → value` row in the detail panel. */
export interface DevToolsDetailRow {
  term: string;
  description: string;
}

/** The non-text (widget) children of a node, the units the tree shows. */
function widgetChildren(node: DOMNode): DOMNode[] {
  return node.children.filter((c) => c.tagName !== "text");
}

/** First run of literal text directly under a node (shown in its detail). */
function ownText(node: DOMNode): string {
  const parts: string[] = [];
  for (const c of node.children) {
    if (c.tagName === "text") {
      const t = (c as { text?: string }).text;
      if (t) parts.push(t);
    }
  }
  return parts.join("");
}

function labelFor(node: DOMNode): string {
  const id = node.id ? ` #${node.id}` : "";
  const cls = node.classes?.size ? ` .${Array.from(node.classes).join(".")}` : "";
  return `${node.tagName || "?"}${id}${cls}`;
}

/** Serialize a live DOM/widget subtree into a {@link DevToolsNode} (root at `prefix`). */
export function serializeDevTree(root: DOMNode, prefix = "0"): DevToolsNode {
  return {
    id: prefix,
    label: labelFor(root),
    tagName: root.tagName,
    children: widgetChildren(root).map((c, i) => serializeDevTree(c, `${prefix}/${i}`)),
  };
}

/** The path id of `target` within `root`, or null when it isn't in the subtree. */
export function findDevId(root: DOMNode, target: DOMNode, prefix = "0"): string | null {
  if (root === target) return prefix;
  const kids = widgetChildren(root);
  for (let i = 0; i < kids.length; i++) {
    const found = findDevId(kids[i], target, `${prefix}/${i}`);
    if (found) return found;
  }
  return null;
}

/** Resolve a {@link DevToolsNode.id} path back to the live node under `root`. */
export function resolveDevNode(root: DOMNode, id: string): DOMNode | null {
  const parts = id.split("/");
  if (parts.length === 0) return null;
  let cur: DOMNode = root;
  for (const part of parts.slice(1)) {
    const idx = Number(part);
    const kids = widgetChildren(cur);
    if (!Number.isInteger(idx) || !kids[idx]) return null;
    cur = kids[idx];
  }
  return cur;
}

/** Per-widget detail rows: identity, geometry, flags, and key resolved style. */
export function widgetDetail(node: DOMNode | null): DevToolsDetailRow[] {
  if (!node) return [];
  const rows: DevToolsDetailRow[] = [{ term: "tag", description: node.tagName || "?" }];
  if (node.id) rows.push({ term: "id", description: node.id });
  if (node.classes?.size)
    rows.push({ term: "classes", description: Array.from(node.classes).join(" ") });
  const text = ownText(node);
  if (text)
    rows.push({ term: "text", description: text.length > 40 ? `${text.slice(0, 39)}…` : text });

  if (node instanceof Widget) {
    const w = node;
    const r = w.region;
    rows.push({ term: "region", description: `x${r.x} y${r.y} ${r.width}×${r.height}` });
    rows.push({ term: "measured", description: `${w.measuredWidth}×${w.measuredHeight}` });
    const flags = [
      w.focusable && "focusable",
      w.focused && "focused",
      w.isDisabled() && "disabled",
      !w.visible && "hidden",
    ].filter(Boolean);
    if (flags.length) rows.push({ term: "state", description: flags.join(" ") });
    const cs = w.computedStyle as Record<string, unknown>;
    for (const key of ["layout", "color", "background", "border"]) {
      const v = cs?.[key];
      if (v != null && v !== "") rows.push({ term: key, description: String(v) });
    }
  }
  return rows;
}
