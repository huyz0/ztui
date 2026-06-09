export class DOMNode {
  public id = "";
  public classes: Set<string> = new Set();
  public tagName = "";
  public parent: DOMNode | null = null;
  public children: DOMNode[] = [];

  constructor(tagName = "") {
    this.tagName = tagName.toLowerCase();
  }

  public appendChild(child: DOMNode): void {
    if (child.parent) {
      child.parent.removeChild(child);
    }
    child.parent = this;
    this.children.push(child);
  }

  public removeChild(child: DOMNode): void {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parent = null;
    }
  }

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

  public walk(callback: (node: DOMNode) => void): void {
    callback(this);
    const sorted = [...this.children].sort((a, b) => {
      const az = (a as any).computedStyle?.zIndex ?? 0;
      const bz = (b as any).computedStyle?.zIndex ?? 0;
      return az - bz;
    });
    for (const child of sorted) {
      child.walk(callback);
    }
  }

  // Compound selector matching: supports tags, IDs, and multiple classes combined (e.g. tag#id.class1.class2)
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
