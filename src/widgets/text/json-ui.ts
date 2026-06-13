import { App } from "../../core/app.ts";
import type { DOMNode } from "../../dom/dom.ts";
import { createWidgetByTagName } from "../../dom/element-registry.ts";
import { TextNode } from "../../dom/text-node.ts";
import { Widget } from "../../dom/widget.ts";
import { Spacing } from "../../geometry/spacing.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";

/**
 * A lenient JSON parser that cleans up and balances partially streamed JSON structures
 * (unclosed quotes, arrays, objects) so they can be parsed dynamically.
 */
export function parsePartialJson(jsonStr: string): any {
  let cleaned = jsonStr.trim();
  if (!cleaned) return null;

  // Fast path: try parsing as-is. A failure here is expected for partial/
  // streamed input, so it is intentionally swallowed — we fall through to the
  // balancing repair pass below rather than logging a non-error.
  try {
    return JSON.parse(cleaned);
  } catch {}

  const stack: ("{" | "[")[] = [];
  let inString = false;
  let isEscaped = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (char === "\\") {
      isEscaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{") {
        stack.push("{");
      } else if (char === "[") {
        stack.push("[");
      } else if (char === "}") {
        if (stack[stack.length - 1] === "{") {
          stack.pop();
        }
      } else if (char === "]") {
        if (stack[stack.length - 1] === "[") {
          stack.pop();
        }
      }
    }
  }

  // If we ended inside a string, close the quote
  if (inString) {
    cleaned += '"';
  }

  // Close open brackets and braces in reverse order
  while (stack.length > 0) {
    const open = stack.pop();
    if (open === "{") {
      cleaned = cleaned.trim();
      if (cleaned.endsWith(",") || cleaned.endsWith(":")) {
        cleaned = cleaned.slice(0, -1).trim();
      }
      cleaned += "}";
    } else if (open === "[") {
      cleaned = cleaned.trim();
      if (cleaned.endsWith(",")) {
        cleaned = cleaned.slice(0, -1).trim();
      }
      cleaned += "]";
    }
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export class JSONUIWidget extends Widget {
  public declare onAction?: (actionName: string, eventData: any) => void;

  private textNode: TextNode | null = null;
  private lastRawJson = "";

  constructor() {
    super("jsonui");
    this.style.layout = "vertical";
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

  public getRawJson(): string {
    return this.textNode ? this.textNode.text : "";
  }

  public override measure(maxW: number, maxH: number): void {
    const rawJson = this.getRawJson();

    if (rawJson !== this.lastRawJson) {
      this.lastRawJson = rawJson;

      // Clear all generated widgets
      while (this.children.length > 0) {
        super.removeChild(this.children[0]);
      }

      if (rawJson) {
        const data = parsePartialJson(rawJson);
        if (data && typeof data === "object") {
          const rootWidget = this.buildWidgetFromJson(data);
          if (rootWidget) {
            super.appendChild(rootWidget);
            this.resolveStylesForGenerated(rootWidget);
          }
        }
      }
    }

    super.measure(maxW, maxH);
  }

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
  }

  private resolveStylesForGenerated(widget: Widget): void {
    // Resolve against this widget's own app, not the global singleton.
    const app = this.app ?? App.instance;
    if (app) {
      widget.computedStyle = app.cssResolver.resolveStyles(widget, false);
    }
    for (const child of widget.children) {
      if (child instanceof Widget) {
        this.resolveStylesForGenerated(child);
      }
    }
  }

  private buildWidgetFromJson(json: any): Widget | null {
    if (!json || typeof json !== "object" || !json.type) return null;
    const widget = createWidgetByTagName(json.type);
    if (!widget) return null;

    if (json.id) widget.id = json.id;
    if (json.style) {
      // Handle margin/padding spacing objects if provided as lists/objects
      const styleObj = { ...json.style };
      if (styleObj.margin !== undefined && typeof styleObj.margin === "object") {
        const m = styleObj.margin;
        styleObj.margin = new Spacing(m.top ?? 0, m.right ?? 0, m.bottom ?? 0, m.left ?? 0);
      }
      if (styleObj.padding !== undefined && typeof styleObj.padding === "object") {
        const p = styleObj.padding;
        styleObj.padding = new Spacing(p.top ?? 0, p.right ?? 0, p.bottom ?? 0, p.left ?? 0);
      }
      widget.style = { ...widget.style, ...styleObj };
    }
    if (json.text) {
      widget.appendChild(new TextNode(json.text));
    }
    if (json.action) {
      const actionName = json.action;
      widget.onClick = (ev) => {
        if (this.onAction) {
          this.onAction(actionName, {
            id: widget.id,
            type: widget.tagName,
            event: ev,
          });
        }
      };
    }
    if (json.children && Array.isArray(json.children)) {
      for (const childJson of json.children) {
        const childWidget = this.buildWidgetFromJson(childJson);
        if (childWidget) widget.appendChild(childWidget);
      }
    }
    return widget;
  }
}
