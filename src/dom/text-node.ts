import { DOMNode } from "./dom.ts";

/**
 * A DOM node holding a run of literal text.
 *
 * Text content originates from JSX text children, but the node itself is a pure
 * DOM-layer concept (it carries no React/reconciler state), so it lives in the
 * DOM layer. The React host-config creates these for text instances, and
 * framework-neutral widgets read their `.text` when computing rendered content.
 */
export class TextNode extends DOMNode {
  constructor(public text: string) {
    super("text");
  }
}
