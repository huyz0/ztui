import type { Token, Tokens } from "marked";
import remend from "remend";
import { App } from "../../core/app.ts";
import { createWidgetByTagName } from "../../dom/element-registry.ts";
import { Scrollable } from "../../dom/scrollable.ts";
import { TextNode } from "../../dom/text-node.ts";
import { TextSource } from "../../dom/text-source.ts";
import { Widget } from "../../dom/widget.ts";
import type { MouseEvent } from "../../driver/driver.ts";
import { Spacing } from "../../geometry/spacing.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { tokensToMarkup } from "../../render/rich/markdown.ts";
import { getMarked } from "../../render/rich/marked-loader.ts";
import { RichText } from "../../render/rich/text.ts";
import { stringWidth } from "../../render/segment.ts";
import { logger } from "../../utils/logger.ts";
import { CopyButtonWidget } from "../copy-button.ts";
import { handleReadonlySelectionMouse } from "../readonly-selection.ts";
import { parsePartialJson } from "./json-ui.ts";
import { RichTextWidget } from "./rich-text.ts";
import { SyntaxWidget } from "./syntax.ts";

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

/** Visual vocabulary for a GFM alert variant: a leading icon + accent colour. */
interface AlertMeta {
  icon: string;
  color: string;
  title: string;
}

/**
 * The five GitHub-Flavored-Markdown alert variants, mapped to a single-cell
 * icon, a theme accent, and a heading. NOTE/WARNING/CAUTION line up with the
 * `info`/`warning`/`error` Banner tones; TIP borrows `$success` and IMPORTANT
 * `$accent` (the default theme's violet), matching GitHub's own colour cues.
 */
const GFM_ALERTS: Record<string, AlertMeta> = {
  note: { icon: "ⓘ", color: "$primary", title: "Note" },
  tip: { icon: "✦", color: "$success", title: "Tip" },
  important: { icon: "◆", color: "$accent", title: "Important" },
  warning: { icon: "▲", color: "$warning", title: "Warning" },
  caution: { icon: "✘", color: "$error", title: "Caution" },
};

/** Leading `[!TYPE]` marker (with its trailing newline) of a GFM alert blockquote. */
const ALERT_MARKER_RE = /^[ \t]*\[!(note|tip|important|warning|caution)\][ \t]*\r?\n?/i;

/**
 * Recognise a GFM alert (`> [!NOTE]` …). Plain `marked` does not parse the
 * marker, so a blockquote whose inner text opens with `[!TYPE]` is an alert: the
 * marker line is stripped and the remaining body is re-lexed into block tokens.
 * Returns `null` for an ordinary blockquote.
 */
function detectAlert(bq: Tokens.Blockquote): { type: string; bodyTokens: Token[] } | null {
  const text = typeof bq.text === "string" ? bq.text : "";
  const m = text.match(ALERT_MARKER_RE);
  if (!m) return null;
  const bodyMd = text.slice(m[0].length);
  const bodyTokens = bodyMd.trim() ? (getMarked().lexer(bodyMd) as unknown as Token[]) : [];
  return { type: m[1].toLowerCase(), bodyTokens };
}

export class MarkdownWidget extends Scrollable(TextSource(Widget)) {
  private readonly copyButton = new CopyButtonWidget();
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
  public declare onAction?: (actionName: string, eventData: any) => void;

  private lastRawMarkdown = "";
  private lastBlocks: { token: Token; widget: Widget | null }[] = [];

  // Incremental-streaming cache. When the raw markdown only grows (the common
  // streaming case), we avoid re-lexing the whole document: a stable prefix is
  // lexed once into `committedTokens`, and each update only re-lexes the tail
  // after `committedRaw`. Only block types that a blank line can't reopen or
  // that can't reach backward — heading/paragraph/hr — are ever committed, so
  // appended text can never invalidate the committed prefix.
  private committedRaw = "";
  private committedTokens: Token[] = [];
  private static readonly COMMITTABLE = new Set(["heading", "paragraph", "hr"]);
  /** Test hook: force a full re-lex each update (disables the streaming cache). */
  public disableStreamingCache = false;

  /** Length of the committed (cached, never-re-lexed) prefix. For tests. */
  public get committedLength(): number {
    return this.committedRaw.length;
  }

  constructor() {
    super("markdown");
    this.defaultStyle = { layout: "vertical" };
    // A drag started on any rendered block (RichText/Syntax leaf) selects across
    // the whole document, not just that one block.
    this.selectionContainer = true;
    this.copyButton.getText = () => this.getRawMarkdown();
  }

  /**
   * The generated block children are rebuilt wholesale on every content change,
   * so re-attach the copy button (an absolute, out-of-flow child) afterwards.
   * Omitted when the document is empty — nothing to copy.
   */
  private attachCopyButton(): void {
    if (!this.getRawMarkdown()) return;
    this.copyButton.parent = this;
    this.resolveStylesForGenerated(this.copyButton);
    this.children.push(this.copyButton);
  }

  public override handleMouse(ev: MouseEvent): void {
    super.handleMouse(ev);
    if (ev.handled) return;
    // Presses that land on padding/gaps (not a leaf) still start a selection.
    handleReadonlySelectionMouse(this, ev);
  }

  public getRawMarkdown(): string {
    return this.rawText();
  }

  /**
   * Extend the committed prefix by the leading {@link COMMITTABLE} blocks of the
   * freshly-lexed tail that are already closed by a blank line. Those blocks can
   * never change as more text streams in, so on the next update we skip re-lexing
   * them. `tailAll` is the tail token stream *including* `space` tokens so blank
   * lines can be measured; `tailRaw` is the matching raw source slice.
   */
  private advanceCommit(tailRaw: string, tailAll: Token[]): void {
    // A block is "closed" once any later block exists — marked only emits a
    // separate block token across a real boundary, and the blank line may live
    // in the previous token's own `raw`. So commit the contiguous run of leading
    // COMMITTABLE blocks except the last one (which is still being streamed),
    // absorbing the inter-block `space` tokens into the committed prefix.
    let lastBlockIdx = -1;
    for (let i = 0; i < tailAll.length; i++) if (tailAll[i].type !== "space") lastBlockIdx = i;

    let rawOffset = 0;
    let commitOffset = 0;
    const newlyCommitted: Token[] = [];
    for (let i = 0; i < tailAll.length; i++) {
      const t = tailAll[i];
      rawOffset += t.raw.length;
      if (t.type === "space") continue;
      if (i === lastBlockIdx || !MarkdownWidget.COMMITTABLE.has(t.type)) break;
      // Committable and not the last block: fold it plus any trailing blank lines.
      let j = i + 1;
      while (j < tailAll.length && tailAll[j].type === "space")
        rawOffset += tailAll[j++].raw.length;
      newlyCommitted.push(t);
      commitOffset = rawOffset;
      i = j - 1;
    }
    if (commitOffset > 0) {
      this.committedRaw += tailRaw.slice(0, commitOffset);
      this.committedTokens = this.committedTokens.concat(newlyCommitted);
    }
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
        this.committedRaw = "";
        this.committedTokens = [];
      } else {
        try {
          // Re-lex only the streaming tail when the document grew from a cached
          // committed prefix; otherwise (first parse, edit, or replacement) lex
          // the whole thing and reset the cache.
          let blockTokens: Token[];
          let tailRaw: string;
          let tailAll: Token[];
          if (
            this.committedRaw &&
            !this.disableStreamingCache &&
            rawMarkdown.startsWith(this.committedRaw)
          ) {
            tailRaw = rawMarkdown.slice(this.committedRaw.length);
            tailAll = getMarked().lexer(remend(tailRaw));
            blockTokens = this.committedTokens.concat(tailAll.filter((t) => t.type !== "space"));
          } else {
            this.committedRaw = "";
            this.committedTokens = [];
            tailRaw = rawMarkdown;
            tailAll = getMarked().lexer(processedMarkdown);
            blockTokens = tailAll.filter((t) => t.type !== "space");
          }

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
          this.attachCopyButton();
          this.lastBlocks = nextBlocks;
          if (!this.disableStreamingCache) this.advanceCommit(tailRaw, tailAll);
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
          this.attachCopyButton();
          this.lastBlocks = [];
          this.committedRaw = "";
          this.committedTokens = [];
        }
      }
    }

    super.measure(maxW, maxH);
  }

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
  }

  private resolveStylesForGenerated(widget: Widget): void {
    // Resolve against *this widget's* app (not the global singleton), so a
    // second live app can't blank our generated blocks' styles.
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

  private buildWidgetFromToken(token: Token): Widget | null {
    const widget = this.buildBlockFromToken(token);
    // Keep the block's original markdown so a selection that fully covers it
    // copies the raw source (formatting markers intact), not the rendered text.
    if (widget && typeof token.raw === "string") {
      const raw = token.raw.replace(/\n+$/, "");
      if (raw) widget.selectionRaw = raw;
    }
    return widget;
  }

  /**
   * A quoted body row: a `▌` accent bar (chrome, never selectable) beside a
   * vertical body built from `childTokens`. Shared by plain blockquotes (a dim
   * `$secondary` bar) and GFM alert callouts (a solid variant-coloured bar).
   */
  private buildQuoteRow(childTokens: Token[], barColor: string, dimBar: boolean): Widget {
    const container = new Widget("blockquote");
    container.style.layout = "horizontal";

    const bar = new RichTextWidget();
    bar.selectable = false; // the quote bar is chrome, not content
    bar.style.color = barColor;
    if (dimBar) bar.style.dim = true;
    bar.appendChild(new TextNode("▌ "));
    container.appendChild(bar);

    const body = new Widget("blockquote_body");
    body.style.layout = "vertical";
    body.style.flexGrow = 1;
    for (const childToken of childTokens) {
      const w = this.buildWidgetFromToken(childToken);
      if (w) body.appendChild(w);
    }
    container.appendChild(body);

    return container;
  }

  private buildBlockFromToken(token: Token): Widget | null {
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
        rule.selectable = false; // decorative heading underline — not content
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
      token.items.forEach((itemToken: Tokens.ListItem, idx: number) => {
        const itemWidget = this.buildListItemWidget(itemToken, isOrdered, idx);
        if (itemWidget) {
          container.appendChild(itemWidget);
        }
      });

      return container;
    }

    // 4. Blockquote — including GFM alerts (`> [!NOTE]` …) rendered as callouts.
    if (token.type === "blockquote") {
      const alert = detectAlert(token as Tokens.Blockquote);
      if (alert) {
        const meta = GFM_ALERTS[alert.type];
        const container = new Widget("alert");
        container.style.layout = "vertical";
        container.style.margin = new Spacing(0, 0, 1, 0);

        // Callout heading: variant icon + title in the accent colour. It is
        // decoration, not source text, so it registers no selection run — the
        // block's `selectionRaw` already carries the `[!TYPE]` marker for copy.
        const heading = new RichTextWidget();
        heading.selectable = false;
        heading.style.bold = true;
        heading.style.color = meta.color;
        heading.appendChild(new TextNode(`${meta.icon} ${meta.title}`));
        container.appendChild(heading);

        container.appendChild(this.buildQuoteRow(alert.bodyTokens, meta.color, false));
        return container;
      }

      const row = this.buildQuoteRow(token.tokens || [], "$secondary", true);
      row.style.margin = new Spacing(0, 0, 1, 0);
      return row;
    }

    // 5. Thematic Break (HR)
    if (token.type === "hr") {
      const container = new Widget("hr");
      container.style.layout = "vertical";
      container.style.margin = new Spacing(1, 0, 1, 0);

      const rule = new RichTextWidget();
      rule.selectable = false; // horizontal rule is chrome, not content
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
          widget.theme = this.theme;
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

    // 7. Table (GFM) — borderless, color-delineated. Columns are whitespace
    // aligned (no `│`/box chrome that eats width); the header is bold + accent
    // with a thin underline, and body rows zebra-stripe via a background tint so
    // color does the row separation instead of rule lines.
    if (token.type === "table") {
      return this.buildTableWidget(token as Tokens.Table);
    }

    return null;
  }

  private buildTableWidget(token: Tokens.Table): Widget {
    const container = new Widget("table");
    container.style.layout = "vertical";
    container.style.margin = new Spacing(0, 0, 1, 0);

    const aligns = token.align ?? [];
    const headerMarkup = token.header.map((c) => tokensToMarkup(c.tokens));
    const bodyMarkup = token.rows.map((row) => row.map((c) => tokensToMarkup(c.tokens)));

    const plainOf = (markup: string): string => {
      try {
        return RichText.fromMarkup(markup).plain;
      } catch {
        return markup;
      }
    };
    const headerPlain = headerMarkup.map(plainOf);
    const bodyPlain = bodyMarkup.map((row) => row.map(plainOf));

    const ncol = headerMarkup.length;
    const widths = new Array<number>(ncol).fill(0);
    for (let c = 0; c < ncol; c++) {
      widths[c] = stringWidth(headerPlain[c] ?? "");
      for (const row of bodyPlain) {
        widths[c] = Math.max(widths[c], stringWidth(row[c] ?? ""));
      }
    }

    const GAP = "  ";
    // Pad one cell to its column width, honoring the column alignment.
    const padCell = (markup: string, plain: string, c: number): string => {
      const padCount = Math.max(0, widths[c] - stringWidth(plain));
      const align = aligns[c];
      if (align === "right") return " ".repeat(padCount) + markup;
      if (align === "center") {
        const left = Math.floor(padCount / 2);
        return " ".repeat(left) + markup + " ".repeat(padCount - left);
      }
      return markup + " ".repeat(padCount);
    };
    const rowLine = (cells: string[], plains: string[]): string =>
      Array.from({ length: ncol }, (_, c) => padCell(cells[c] ?? "", plains[c] ?? "", c)).join(GAP);

    // Header row: bold + accent.
    const header = new RichTextWidget();
    header.style.bold = true;
    header.style.color = "$accent";
    header.appendChild(new TextNode(`[bold]${rowLine(headerMarkup, headerPlain)}[/]`));
    container.appendChild(header);

    // Thin underline beneath the header — the one structural cue that survives on
    // no-color terminals (zebra striping vanishes without color).
    const rule = new RichTextWidget();
    rule.selectable = false; // table chrome, not content
    rule.style.color = "$dimmed";
    rule.style.dim = true;
    const ruleSegments = widths.map((w) => "─".repeat(w));
    rule.appendChild(new TextNode(ruleSegments.join("──")));
    container.appendChild(rule);

    // Body rows: zebra-stripe odd rows with a surface tint.
    bodyMarkup.forEach((cells, idx) => {
      const row = new RichTextWidget();
      if (idx % 2 === 1) row.style.background = "$panel";
      row.appendChild(new TextNode(rowLine(cells, bodyPlain[idx])));
      container.appendChild(row);
    });

    return container;
  }

  private buildListItemWidget(
    token: Tokens.ListItem,
    isOrdered: boolean,
    index: number,
  ): Widget | null {
    if (token.type !== "list_item") return null;

    const container = new Widget("list_item");
    container.style.layout = "horizontal";
    // A fully covered single item copies its raw markdown ("- item"), so a
    // selection inside one list still round-trips the marker syntax.
    if (typeof token.raw === "string" && token.raw.trim()) {
      container.selectionRaw = token.raw.replace(/\n+$/, "");
    }

    const bulletSymbol = isOrdered ? `${index + 1}. ` : "• ";
    const bullet = new RichTextWidget();
    bullet.selectable = false; // list marker is chrome, not content
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
