import type { DOMNode } from "./dom.ts";
import type { Constructor } from "./scrollable.ts";
import { TextNode } from "./text-node.ts";
import type { Widget } from "./widget.ts";

/**
 * Mixin for widgets whose content is a single child text node — their raw source
 * (markdown, JSON, …). The reconciler appends the source as a `TextNode`; this
 * captures it through the DOM-mutation methods, keeps it out of the normal child
 * list (so it never participates in layout), and exposes it via {@link rawText}.
 *
 * A mixin rather than a base class so it composes with other mixins, e.g.
 * `Scrollable(TextSource(Widget))`.
 */
/** The members {@link TextSource} adds to a Widget subclass. */
export interface TextSourceMembers {
  /** @internal The captured source text node, kept out of the layout child list. */
  textNode: TextNode | null;
  /** @internal The captured raw source text, or "" when none has been set. */
  rawText(): string;
}

export function TextSource<TBase extends Constructor<Widget>>(
  Base: TBase,
): TBase & Constructor<TextSourceMembers> {
  return class TextSourceMixin extends Base {
    public textNode: TextNode | null = null;

    /** The captured raw source text, or "" when none has been set. */
    public rawText(): string {
      return this.textNode ? this.textNode.text : "";
    }

    public override appendChild(child: DOMNode): void {
      if (child instanceof TextNode) {
        this.textNode = child;
        child.parent = this;
      } else {
        super.appendChild(child);
      }
    }

    public override removeChild(child: DOMNode): void {
      if (child === this.textNode) {
        this.textNode = null;
        child.parent = null;
      } else {
        super.removeChild(child);
      }
    }

    public override insertBefore(child: DOMNode, before: DOMNode): void {
      if (child instanceof TextNode) {
        this.textNode = child;
        child.parent = this;
      } else {
        super.insertBefore(child, before);
      }
    }
  };
}
