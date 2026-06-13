import type { Token } from "marked";
import { stringWidth } from "../segment.ts";
import { Style } from "../style.ts";
import { getMarked } from "./marked-loader.ts";
import { Syntax } from "./syntax.ts";
import { RichText, type Span, splitRichTextIntoLines } from "./text.ts";

/**
 * Translate `marked`'s inline token stream into console markup tags. Relies on
 * `Token` being a discriminated union on `type`, so each branch narrows without
 * casting. Shared by the pure-text renderer here and the block-level
 * `MarkdownWidget` (`widgets/text/markdown.ts`), which is the single source of
 * truth for inline → markup conversion.
 */
export function tokensToMarkup(tokens: Token[] | undefined): string {
  if (!tokens) return "";
  let markup = "";
  for (const token of tokens) {
    if (token.type === "text") {
      markup += token.text;
    } else if (token.type === "codespan") {
      markup += `[dim yellow]${token.text}[/]`;
    } else if (token.type === "strong") {
      markup += `[bold]${tokensToMarkup(token.tokens)}[/]`;
    } else if (token.type === "em") {
      markup += `[italic]${tokensToMarkup(token.tokens)}[/]`;
    } else if (token.type === "del") {
      markup += `[strikethrough]${tokensToMarkup(token.tokens)}[/]`;
    } else if (token.type === "link") {
      const href = token.href || "";
      markup += `[bright-blue underline link=${href}]${tokensToMarkup(token.tokens)}[/]`;
    } else if (token.type === "image") {
      const src = token.href || "";
      const alt = token.text || "image";
      markup += `[dim]🖼️  ${alt} (${src})[/]`;
    } else if (token.type === "escape") {
      markup += token.text;
    } else if (token.type === "br") {
      markup += "\n";
    } else if ("tokens" in token && token.tokens) {
      markup += tokensToMarkup(token.tokens);
    } else {
      markup += token.raw || "";
    }
  }
  return markup;
}

/**
 * Translates inline markdown syntax (e.g. **bold**, *italic*, `code`, [text](url)) into console markup tags.
 */
export function parseInlineMarkdown(text: string): string {
  let result = text;

  // 1. Link formatting: [text](url) -> [link=url]text[/link]
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "[link=$2]$1[/]");

  // 2. Bold formatting: **text** or __text__ -> [bold]text[/]
  result = result.replace(/\*\*(.*?)\*\*/g, "[bold]$1[/]");
  result = result.replace(/__(.*?)__/g, "[bold]$1[/]");

  // 3. Italic formatting: *text* or _text_ -> [italic]text[/]
  result = result.replace(/\*(.*?)\*/g, "[italic]$1[/]");
  result = result.replace(/_(.*?)_/g, "[italic]$1[/]");

  // 4. Inline code: `code` -> [dim cyan]code[/]
  result = result.replace(/`(.*?)`/g, "[dim cyan]$1[/]");

  return result;
}

// biome-ignore lint/complexity/noStaticOnlyClass: Mimic Python's rich module structure via static class methods
export class Markdown {
  /**
   * Parses markdown and returns an array of RichText lines pre-formatted and styled.
   */
  public static renderToLines(markdown: string, themeName = "theme"): RichText[] {
    const tokens = getMarked().lexer(markdown);
    const lines: RichText[] = [];

    // Base theme styles
    const headingColors = {
      h1: "$primary",
      h2: "$secondary",
      h3: "$accent",
      h4: "$success",
      h5: "$warning",
      h6: "$dimmed",
    };

    const bulletStyle = new Style({ color: "$primary", bold: true });
    const numberStyle = new Style({ color: "$primary", bold: true });
    const quoteBarStyle = new Style({ color: "$secondary" });
    const hrStyle = new Style({ color: "$dimmed" });

    // Helper to format block prefixes (like list bullets, line numbers, blockquotes)
    const formatLine = (richLine: RichText, prefix: string, prefixSpans: Span[]): RichText => {
      const fullText = prefix + richLine.plain;
      const spans = richLine.spans.map((s) => ({
        start: s.start + prefix.length,
        end: s.end + prefix.length,
        style: s.style,
      }));
      return new RichText(fullText, [...prefixSpans, ...spans]);
    };

    // Recursive helper to process block tokens
    const processBlocks = (blockTokens: Token[], indentLevel = 0, inBlockquote = false) => {
      for (const token of blockTokens) {
        if (token.type === "heading") {
          const depth = token.depth;
          const hColor = headingColors[`h${depth}` as keyof typeof headingColors] || "white";
          const headingStyle = new Style({ color: hColor, bold: true });

          const markup = tokensToMarkup(token.tokens);
          const richHeader = RichText.fromMarkup(markup);
          const spans = richHeader.spans.map((s) => ({ ...s }));
          spans.push({ start: 0, end: richHeader.plain.length, style: headingStyle });

          let formattedLine = new RichText(richHeader.plain, spans);
          if (inBlockquote) {
            formattedLine = formatLine(formattedLine, "▌ ", [
              { start: 0, end: 2, style: quoteBarStyle },
            ]);
          }

          lines.push(formattedLine);

          if (depth === 1 || depth === 2) {
            const char = depth === 1 ? "━" : "─";
            const ruleText = char.repeat(Math.max(20, richHeader.plain.length));
            let richRule = new RichText(ruleText, [
              { start: 0, end: ruleText.length, style: headingStyle },
            ]);
            if (inBlockquote) {
              richRule = formatLine(richRule, "▌ ", [{ start: 0, end: 2, style: quoteBarStyle }]);
            }
            lines.push(richRule);
          }
          lines.push(new RichText(""));
        } else if (token.type === "paragraph") {
          const markup = tokensToMarkup(token.tokens);
          const richPara = RichText.fromMarkup(markup);
          const paraLines = splitRichTextIntoLines(richPara);

          for (const line of paraLines) {
            let formattedLine = line;
            if (inBlockquote) {
              formattedLine = formatLine(formattedLine, "▌ ", [
                { start: 0, end: 2, style: quoteBarStyle },
              ]);
            }
            lines.push(formattedLine);
          }
          lines.push(new RichText(""));
        } else if (token.type === "blockquote") {
          processBlocks(token.tokens ?? [], indentLevel, true);
        } else if (token.type === "hr") {
          const ruleText = "─".repeat(50);
          lines.push(new RichText(ruleText, [{ start: 0, end: ruleText.length, style: hrStyle }]));
          lines.push(new RichText(""));
        } else if (token.type === "code") {
          const lang = token.lang ? token.lang.split(/\s+/)[0] : "text";
          const code = token.text.replace(/\r?\n$/, "");

          const syntaxLines = Syntax.renderToLines(code, lang, true, themeName);

          let maxLineLen = 0;
          for (const line of syntaxLines) {
            maxLineLen = Math.max(maxLineLen, stringWidth(line.plain));
          }

          const borderStyle = new Style({ color: "$dimmed" });

          // 1. Top border line
          const topText = `┌${"─".repeat(maxLineLen + 2)}┐`;
          let topBorderLine = new RichText(topText, [
            { start: 0, end: topText.length, style: borderStyle },
          ]);
          if (inBlockquote) {
            topBorderLine = formatLine(topBorderLine, "▌ ", [
              { start: 0, end: 2, style: quoteBarStyle },
            ]);
          }
          topBorderLine = formatLine(topBorderLine, "  ", []);
          lines.push(topBorderLine);

          // 2. Middle code lines with borders
          for (const line of syntaxLines) {
            const paddingCount = maxLineLen - stringWidth(line.plain);
            const paddedPlain = line.plain + " ".repeat(paddingCount);
            const fullPlain = `│ ${paddedPlain} │`;

            const shiftedSpans = line.spans.map((s) => ({
              start: s.start + 2,
              end: s.end + 2,
              style: s.style,
            }));

            const leftBorderSpan = { start: 0, end: 2, style: borderStyle };
            const rightBorderSpan = {
              start: 2 + paddedPlain.length,
              end: fullPlain.length,
              style: borderStyle,
            };

            let middleLine = new RichText(fullPlain, [
              leftBorderSpan,
              rightBorderSpan,
              ...shiftedSpans,
            ]);

            if (inBlockquote) {
              middleLine = formatLine(middleLine, "▌ ", [
                { start: 0, end: 2, style: quoteBarStyle },
              ]);
            }
            middleLine = formatLine(middleLine, "  ", []);
            lines.push(middleLine);
          }

          // 3. Bottom border line
          const bottomText = `└${"─".repeat(maxLineLen + 2)}┘`;
          let bottomBorderLine = new RichText(bottomText, [
            { start: 0, end: bottomText.length, style: borderStyle },
          ]);
          if (inBlockquote) {
            bottomBorderLine = formatLine(bottomBorderLine, "▌ ", [
              { start: 0, end: 2, style: quoteBarStyle },
            ]);
          }
          bottomBorderLine = formatLine(bottomBorderLine, "  ", []);
          lines.push(bottomBorderLine);

          lines.push(new RichText(""));
        } else if (token.type === "list") {
          let listIndex = token.start !== undefined ? token.start : 1;
          for (const item of token.items) {
            // Process the list item text / tokens
            let itemTextToken = item.tokens.find(
              (t: Token) => t.type === "text" || t.type === "paragraph",
            );
            if (!itemTextToken) {
              itemTextToken = item.tokens[0];
            }

            const inlineTokens =
              itemTextToken && "tokens" in itemTextToken ? itemTextToken.tokens : undefined;
            const itemMarkup = itemTextToken ? tokensToMarkup(inlineTokens ?? [itemTextToken]) : "";
            const richItem = RichText.fromMarkup(itemMarkup);

            let prefix = "";
            const prefixSpans: Span[] = [];
            const indentSpaces = "  ".repeat(indentLevel);

            if (!token.ordered) {
              prefix = `${indentSpaces}  •  `;
              prefixSpans.push({
                start: prefix.length - 3,
                end: prefix.length - 2,
                style: bulletStyle,
              });
            } else {
              const numStr = String(listIndex++);
              prefix = `${indentSpaces}  ${numStr}. `;
              prefixSpans.push({
                start: prefix.length - numStr.length - 2,
                end: prefix.length,
                style: numberStyle,
              });
            }

            let formattedLine = formatLine(richItem, prefix, prefixSpans);
            if (inBlockquote) {
              formattedLine = formatLine(formattedLine, "▌ ", [
                { start: 0, end: 2, style: quoteBarStyle },
              ]);
            }
            lines.push(formattedLine);

            // Handle nested list blocks or sub-blocks in item
            const subBlocks = item.tokens.filter(
              (t: any) => t !== itemTextToken && t.type !== "text",
            );
            if (subBlocks.length > 0) {
              processBlocks(subBlocks, indentLevel + 1, inBlockquote);
            }
          }
        }
      }
    };

    processBlocks(tokens);

    if (lines.length > 0 && lines[lines.length - 1].plain === "") {
      lines.pop();
    }

    return lines;
  }
}
