/**
 * Base tree node: parent/children links and identity. {@link Widget} extends it
 * with layout, styling, and rendering. Bindings build a tree of these and the
 * engine walks it each frame.
 */
export class DOMNode {
  /** Optional stable identifier (from the `id` prop). */
  public id = "";
  /** Advisory class names (no CSS cascade today). */
  public classes: Set<string> = new Set();
  /** Host element tag, lowercased (e.g. "ztui-button"). */
  public tagName = "";
  /** Parent node, or null when detached / at the root. */
  public parent: DOMNode | null = null;
  /** Child nodes in document order. */
  public children: DOMNode[] = [];

  constructor(tagName = "") {
    this.tagName = tagName.toLowerCase();
  }

  /** Append `child`, detaching it from any previous parent. */
  public appendChild(child: DOMNode): void {
    if (child.parent) {
      child.parent.removeChild(child);
    }
    child.parent = this;
    this.children.push(child);
  }

  /** Remove `child` if it's a child of this node. */
  public removeChild(child: DOMNode): void {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parent = null;
    }
  }

  /** Insert `child` before the `before` sibling (appends if `before` isn't found). */
  public insertBefore(child: DOMNode, before: DOMNode): void {
    if (child.parent) {
      child.parent.removeChild(child);
    }
    const idx = this.children.indexOf(before);
    if (idx !== -1) {
      child.parent = this;
      this.children.splice(idx, 0, child);
    } else {
      this.appendChild(child);
    }
  }

  /**
   * Human/LLM-readable identity for logs and diagnostics, e.g.
   * `button#submit.primary @ (2,1 10x1)`. Includes the laid-out region when
   * one is present (widgets), and the text preview for text nodes.
   */
  public describe(): string {
    const text = (this as { text?: unknown }).text;
    if (typeof text === "string") {
      const preview = text.length > 20 ? `${text.slice(0, 20).trimEnd()}…` : text;
      return `${this.tagName}("${preview}")`;
    }
    let sel = this.tagName || "node";
    if (this.id) sel += `#${this.id}`;
    if (this.classes.size > 0) sel += `.${[...this.classes].join(".")}`;
    const region = (this as { region?: { toString(): string } }).region;
    if (region) sel += ` @ ${region.toString()}`;
    return sel;
  }

  /**
   * Depth-first visit of this node and its descendants, in z-index (paint)
   * order — mirrors what's actually drawn on top, for callers like
   * `toAccessibleText()`. z-index is a paint-only concept, so callers that
   * need tab/focus order (nothing to do with stacking) should use
   * {@link walkDocumentOrder} instead — otherwise a widget with a nonzero
   * z-index purely for painting (e.g. an overlapping decorative sibling)
   * jumps to a different position in the Tab sequence than where it
   * structurally sits.
   */
  public walk(callback: (node: DOMNode) => void): void {
    callback(this);
    // `zIndex` lives on Widget; reading it structurally avoids a dom → widget
    // import cycle while staying typed (no `any`).
    const z = (n: DOMNode): number =>
      (n as { computedStyle?: { zIndex?: number } }).computedStyle?.zIndex ?? 0;
    const sorted = [...this.children].sort((a, b) => z(a) - z(b));
    for (const child of sorted) {
      child.walk(callback);
    }
  }

  /**
   * Depth-first visit of this node and its descendants in plain document
   * order, ignoring z-index. Use for tab/focus order (e.g.
   * {@link Screen.getFocusableWidgets}) — see {@link walk}'s doc comment for
   * why z-index order is wrong there.
   */
  public walkDocumentOrder(callback: (node: DOMNode) => void): void {
    callback(this);
    for (const child of this.children) {
      child.walkDocumentOrder(callback);
    }
  }

  /** Match a compound selector against this node — tags, IDs, and classes (e.g. `tag#id.a.b`). */
  public matchesSelector(selector: string): boolean {
    const sel = selector.trim();
    if (!sel) return false;

    let tagMatch = "";
    let remainder = sel;

    if (!sel.startsWith("#") && !sel.startsWith(".")) {
      const match = sel.match(/^([a-zA-Z0-9_-]+)/);
      if (match) {
        tagMatch = match[1];
        remainder = sel.slice(tagMatch.length);
      }
    }

    if (tagMatch && this.tagName !== tagMatch.toLowerCase()) {
      return false;
    }

    const parts = remainder.match(/(#[a-zA-Z0-9_-]+|\.[a-zA-Z0-9_-]+)/g) || [];
    for (const part of parts) {
      if (part.startsWith("#")) {
        if (this.id !== part.slice(1)) {
          return false;
        }
      } else if (part.startsWith(".")) {
        if (!this.classes.has(part.slice(1))) {
          return false;
        }
      }
    }

    const matchedLength = tagMatch.length + parts.reduce((sum, p) => sum + p.length, 0);
    return matchedLength === sel.length;
  }
}
