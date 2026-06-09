import { marked, type Token } from "marked";
import remend from "remend";
import { App } from "../core/app.ts";
import { logger } from "../core/logger.ts";
import type { DOMNode } from "../dom/dom.ts";
import { Scrollable } from "../dom/scrollable.ts";
import { Widget } from "../dom/widget.ts";
import { Spacing } from "../geometry/spacing.ts";
import { createWidgetByTagName, TextNode } from "../react/host-config.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { stringWidth } from "../render/segment.ts";
import { parsePartialJson } from "./json-ui.ts";
import { RichTextWidget } from "./rich-text.ts";
import { SyntaxWidget } from "./syntax.ts";

function tokensToMarkup(tokens: Token[] | undefined): string {
  if (!tokens) return "";
  let markup = "";
  for (const token of tokens) {
    if (token.type === "text") {
      markup += token.text;
    } else if (token.type === "codespan") {
      markup += `[dim yellow]${token.text}[/]`;
    } else if (token.type === "strong") {
      markup += `[bold]${tokensToMarkup((token as any).tokens)}[/]`;
    } else if (token.type === "em") {
      markup += `[italic]${tokensToMarkup((token as any).tokens)}[/]`;
    } else if (token.type === "del") {
      markup += `[strikethrough]${tokensToMarkup((token as any).tokens)}[/]`;
    } else if (token.type === "link") {
      const href = (token as any).href || "";
      markup += `[bright-blue underline link=${href}]${tokensToMarkup((token as any).tokens)}[/]`;
    } else if (token.type === "image") {
      const src = (token as any).href || "";
      const alt = (token as any).text || "image";
      markup += `[dim]🖼️  ${alt} (${src})[/]`;
    } else if (token.type === "escape") {
      markup += token.text;
    } else if (token.type === "br") {
      markup += "\n";
    } else if ((token as any).tokens) {
      markup += tokensToMarkup((token as any).tokens);
    } else {
      markup += token.raw || "";
    }
  }
  return markup;
}

function areTokensEqual(a: any, b: any): boolean {
  if (!a || !b) return a === b;
  if (a.type !== b.type || a.raw !== b.raw) return false;

  if (a.type === "heading") {
    if (a.depth !== b.depth || a.text !== b.text) return false;
  } else if (a.type === "list") {
    if (a.ordered !== b.ordered || a.start !== b.start || a.loose !== b.loose) return false;
    if (a.items?.length !== b.items?.length) return false;
    for (let i = 0; i < a.items.length; i++) {
      if (!areTokensEqual(a.items[i], b.items[i])) return false;
    }
  } else if (a.type === "list_item") {
    if (a.task !== b.task || a.checked !== b.checked || a.loose !== b.loose || a.text !== b.text)
      return false;
  } else if (a.type === "code") {
    if (a.lang !== b.lang || a.text !== b.text) return false;
  } else if (a.type === "blockquote") {
    if (a.text !== b.text) return false;
  }

  if ((a.tokens && !b.tokens) || (!a.tokens && b.tokens)) return false;
  if (a.tokens && b.tokens) {
    if (a.tokens.length !== b.tokens.length) return false;
    for (let i = 0; i < a.tokens.length; i++) {
      if (!areTokensEqual(a.tokens[i], b.tokens[i])) return false;
    }
  }

  return true;
}

export class MarkdownWidget extends Scrollable(Widget) {
  private _markdownTheme?: string = "theme";
  public override get theme(): string | undefined {
    return this._markdownTheme;
  }
  public override set theme(val: string | undefined) {
    if (this._markdownTheme !== val) {
      this._markdownTheme = val;
      this.propagateTheme();
    }
  }

  private propagateTheme(): void {
    const update = (w: Widget) => {
      w.theme = this._markdownTheme;
      for (const child of w.children) {
        if (child instanceof Widget) {
          update(child);
        }
      }
    };
    for (const child of this.children) {
      if (child instanceof Widget) {
        update(child);
      }
    }
  }
  public onAction?: (actionName: string, eventData: any) => void;

  private textNode: TextNode | null = null;
  private lastRawMarkdown = "";
  private lastBlocks: { token: Token; widget: Widget | null }[] = [];

  constructor() {
    super("markdown");
    this.defaultStyle = { layout: "vertical" };
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

  public getRawMarkdown(): string {
    return this.textNode ? this.textNode.text : "";
  }

  public override measure(maxW: number, maxH: number): void {
    const rawMarkdown = this.getRawMarkdown();

    if (rawMarkdown !== this.lastRawMarkdown) {
      this.lastRawMarkdown = rawMarkdown;

      const processedMarkdown = rawMarkdown ? remend(rawMarkdown) : "";

      if (!processedMarkdown) {
        // Clear all generated widgets from this.children
        while (this.children.length > 0) {
          const child = this.children[0];
          super.removeChild(child);
        }
        this.lastBlocks = [];
      } else {
        try {
          const tokens = marked.lexer(processedMarkdown);
          const blockTokens = tokens.filter((t) => t.type !== "space");

          const nextBlocks: { token: Token; widget: Widget | null }[] = [];

          // Reconciliation
          const len = Math.max(blockTokens.length, this.lastBlocks.length);
          for (let i = 0; i < len; i++) {
            const newToken = blockTokens[i];
            const oldBlock = this.lastBlocks[i];

            if (newToken && oldBlock) {
              if (areTokensEqual(newToken, oldBlock.token)) {
                // Reuse existing block widget
                nextBlocks.push({ token: newToken, widget: oldBlock.widget });
              } else {
                // Recreate widget
                if (oldBlock.widget) {
                  super.removeChild(oldBlock.widget);
                }
                const newWidget = this.buildWidgetFromToken(newToken);
                if (newWidget) {
                  this.resolveStylesForGenerated(newWidget);
                }
                nextBlocks.push({ token: newToken, widget: newWidget });
              }
            } else if (newToken) {
              // New block added
              const newWidget = this.buildWidgetFromToken(newToken);
              if (newWidget) {
                this.resolveStylesForGenerated(newWidget);
              }
              nextBlocks.push({ token: newToken, widget: newWidget });
            } else if (oldBlock) {
              // Old block removed
              if (oldBlock.widget) {
                super.removeChild(oldBlock.widget);
              }
            }
          }

          // Apply updated active widgets to this.children
          const activeWidgets = nextBlocks
            .map((b) => b.widget)
            .filter((w): w is Widget => w !== null);

          for (const widget of activeWidgets) {
            widget.parent = this;
          }
          this.children = activeWidgets;
          this.lastBlocks = nextBlocks;
        } catch (err) {
          // Malformed markdown must not blank the widget or crash layout:
          // show the raw text and log so the bad input is visible.
          logger.warn(
            "markdown",
            `failed to parse markdown; showing raw text: ${this.describe()}`,
            err,
          );
          while (this.children.length > 0) {
            super.removeChild(this.children[0]);
          }
          const fallback = new RichTextWidget();
          fallback.appendChild(new TextNode(rawMarkdown));
          this.resolveStylesForGenerated(fallback);
          fallback.parent = this;
          this.children = [fallback];
          this.lastBlocks = [];
        }
      }
    }

    super.measure(maxW, maxH);
  }

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
  }

  private resolveStylesForGenerated(widget: Widget): void {
    if (App.instance) {
      widget.computedStyle = App.instance.cssResolver.resolveStyles(widget, false);
    }
    for (const child of widget.children) {
      if (child instanceof Widget) {
        this.resolveStylesForGenerated(child);
      }
    }
  }

  private buildWidgetFromToken(token: Token): Widget | null {
    // 1. Heading
    if (token.type === "heading") {
      const headingColors = {
        1: "$primary",
        2: "$secondary",
        3: "$accent",
        4: "$success",
        5: "$warning",
        6: "$dimmed",
      };
      const depth = token.depth || 1;
      const color = headingColors[depth as keyof typeof headingColors] || "white";
      const content = tokensToMarkup(token.tokens);

      const container = new Widget("heading");
      container.style.layout = "vertical";
      container.style.margin = new Spacing(0, 0, 1, 0);

      const richText = new RichTextWidget();
      richText.style.bold = true;
      richText.style.color = color;
      richText.appendChild(new TextNode(`[bold]${content}[/]`));
      container.appendChild(richText);

      if (depth === 1 || depth === 2) {
        const rule = new RichTextWidget();
        rule.style.color = "$dimmed";
        rule.style.dim = true;
        rule.appendChild(new TextNode("━".repeat(Math.max(10, stringWidth(content)))));
        container.appendChild(rule);
      }

      return container;
    }

    // 2. Paragraph or Text container
    if (token.type === "paragraph" || token.type === "text") {
      const content = tokensToMarkup(token.tokens);
      if (!content) return null;

      const container = new Widget(token.type);
      container.style.layout = "vertical";
      if (token.type === "paragraph") {
        container.style.margin = new Spacing(0, 0, 1, 0);
      }

      const richText = new RichTextWidget();
      richText.appendChild(new TextNode(content));
      container.appendChild(richText);

      return container;
    }

    // 3. Lists
    if (token.type === "list") {
      const container = new Widget(token.ordered ? "ordered_list" : "bullet_list");
      container.style.layout = "vertical";
      container.style.margin = new Spacing(0, 0, 1, 0);

      const isOrdered = token.ordered || false;
      (token.items as any[]).forEach((itemToken: any, idx: number) => {
        const itemWidget = this.buildListItemWidget(itemToken, isOrdered, idx);
        if (itemWidget) {
          container.appendChild(itemWidget);
        }
      });

      return container;
    }

    // 4. Blockquote
    if (token.type === "blockquote") {
      const container = new Widget("blockquote");
      container.style.layout = "horizontal";
      container.style.margin = new Spacing(0, 0, 1, 0);

      const bar = new RichTextWidget();
      bar.style.color = "$secondary";
      bar.style.dim = true;
      bar.appendChild(new TextNode("▌ "));
      container.appendChild(bar);

      const body = new Widget("blockquote_body");
      body.style.layout = "vertical";
      body.style.flexGrow = 1;

      for (const childToken of token.tokens || []) {
        const w = this.buildWidgetFromToken(childToken);
        if (w) body.appendChild(w);
      }
      container.appendChild(body);

      return container;
    }

    // 5. Thematic Break (HR)
    if (token.type === "hr") {
      const container = new Widget("hr");
      container.style.layout = "vertical";
      container.style.margin = new Spacing(1, 0, 1, 0);

      const rule = new RichTextWidget();
      rule.style.color = "$dimmed";
      rule.style.dim = true;
      rule.appendChild(new TextNode("─".repeat(40)));
      container.appendChild(rule);

      return container;
    }

    // 6. Fence (Code Block & Custom UI)
    if (token.type === "code") {
      const lang = token.lang ? token.lang.trim().toLowerCase() : "text";

      const widget =
        lang !== "mermaid" && lang !== "ztui-mermaid" ? createWidgetByTagName(lang) : null;
      if (widget) {
        if ("theme" in widget) {
          (widget as any).theme = this.theme;
        }
        const props = parsePartialJson(token.text.trim());
        if (props && typeof props === "object") {
          if (props.style) {
            const styleObj = { ...props.style };
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
          if (props.text) {
            widget.appendChild(new TextNode(props.text));
          }
          if (props.id) widget.id = props.id;
          if (props.action) {
            const actionName = props.action;
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
          if (props.children && Array.isArray(props.children)) {
            for (const childProps of props.children) {
              const childWidget = this.buildWidgetFromJson(childProps);
              if (childWidget) widget.appendChild(childWidget);
            }
          }
          return widget;
        } else {
          // Fallback if JSON is completely unparseable
          widget.appendChild(new TextNode(token.text));
          return widget;
        }
      }

      const syntax = new SyntaxWidget();
      syntax.language = lang;
      syntax.theme = this.theme;
      syntax.lineNumbers = true;
      syntax.style.border = "dashed";
      syntax.style.borderColor = "$dimmed";
      syntax.style.margin = new Spacing(0, 0, 1, 0);
      syntax.appendChild(new TextNode(token.text.trim()));
      return syntax;
    }

    return null;
  }

  private buildListItemWidget(token: any, isOrdered: boolean, index: number): Widget | null {
    if (token.type !== "list_item") return null;

    const container = new Widget("list_item");
    container.style.layout = "horizontal";

    const bulletSymbol = isOrdered ? `${index + 1}. ` : "• ";
    const bullet = new RichTextWidget();
    bullet.style.color = "$primary";
    bullet.style.bold = true;
    bullet.appendChild(new TextNode(bulletSymbol));
    container.appendChild(bullet);

    const body = new Widget("list_item_body");
    body.style.layout = "vertical";
    body.style.flexGrow = 1;

    for (const childToken of token.tokens || []) {
      const w = this.buildWidgetFromToken(childToken);
      if (w) body.appendChild(w);
    }
    container.appendChild(body);

    return container;
  }

  private buildWidgetFromJson(json: any): Widget | null {
    if (!json || typeof json !== "object" || !json.type) return null;
    const widget = createWidgetByTagName(json.type);
    if (!widget) return null;

    if (json.id) widget.id = json.id;
    if (json.style) {
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
