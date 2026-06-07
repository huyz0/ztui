import MarkdownIt from "markdown-it";
import { Style } from "../style.ts";
import { Syntax } from "./syntax.ts";
import { RichText, type Span, splitRichTextIntoLines } from "./text.ts";

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
  public static renderToLines(
    markdown: string,
    themeName: "ansi_dark" | "ansi_light" = "ansi_dark",
  ): RichText[] {
    const md = new MarkdownIt({ html: true, linkify: true });
    const tokens = md.parse(markdown, {});
    const lines: RichText[] = [];

    // Base theme styles
    const headingColors = {
      h1: "bright-cyan",
      h2: "bright-blue",
      h3: "green",
      h4: "yellow",
      h5: "magenta",
      h6: "gray",
    };

    const bulletStyle = new Style({ color: "bright-blue", bold: true });
    const numberStyle = new Style({ color: "bright-blue", bold: true });
    const quoteBarStyle = new Style({ color: "blue", dim: true });
    const hrStyle = new Style({ color: "gray", dim: true });
    const linkStyle = new Style({ color: "bright-blue", underline: true });
    const inlineCodeStyle = new Style({ color: "bright-yellow", dim: true });

    const listStack: { type: "bullet" | "ordered"; index: number }[] = [];
    let indentLevel = 0;
    let inBlockquote = false;

    // Helper to process inline children recursively into RichText spans
    const processInline = (inlineTokens: any[]): RichText => {
      let plain = "";
      const spans: Span[] = [];
      const styleStack: { style: Style; start: number }[] = [];

      for (const t of inlineTokens) {
        if (t.type === "text") {
          plain += t.content;
        } else if (t.type === "softbreak") {
          plain += " ";
        } else if (t.type === "hardbreak") {
          plain += "\n";
        } else if (t.type === "code_inline") {
          const start = plain.length;
          plain += t.content;
          spans.push({ start, end: plain.length, style: inlineCodeStyle });
        } else if (t.type === "strong_open") {
          styleStack.push({ style: new Style({ bold: true }), start: plain.length });
        } else if (t.type === "strong_close") {
          const open = styleStack.pop();
          if (open) {
            spans.push({ start: open.start, end: plain.length, style: open.style });
          }
        } else if (t.type === "em_open") {
          styleStack.push({ style: new Style({ italic: true }), start: plain.length });
        } else if (t.type === "em_close") {
          const open = styleStack.pop();
          if (open) {
            spans.push({ start: open.start, end: plain.length, style: open.style });
          }
        } else if (t.type === "s_open") {
          styleStack.push({ style: new Style({ strikethrough: true }), start: plain.length });
        } else if (t.type === "s_close") {
          const open = styleStack.pop();
          if (open) {
            spans.push({ start: open.start, end: plain.length, style: open.style });
          }
        } else if (t.type === "link_open") {
          const hrefAttr = t.attrs?.find((a: any) => a[0] === "href");
          const href = hrefAttr ? hrefAttr[1] : "";
          styleStack.push({
            style: linkStyle.merge(new Style({ link: href })),
            start: plain.length,
          });
        } else if (t.type === "link_close") {
          const open = styleStack.pop();
          if (open) {
            spans.push({ start: open.start, end: plain.length, style: open.style });
          }
        } else if (t.type === "image") {
          const srcAttr = t.attrs?.find((a: any) => a[0] === "src");
          const src = srcAttr ? srcAttr[1] : "";
          const alt = t.content || "image";
          const start = plain.length;
          plain += `🖼️  ${alt} (${src})`;
          spans.push({
            start,
            end: plain.length,
            style: new Style({ color: "bright-magenta", italic: true }),
          });
        }
      }

      while (styleStack.length > 0) {
        const open = styleStack.pop()!;
        spans.push({ start: open.start, end: plain.length, style: open.style });
      }

      return new RichText(plain, spans);
    };

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

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      if (token.type === "bullet_list_open") {
        listStack.push({ type: "bullet", index: 0 });
        indentLevel++;
        continue;
      }
      if (token.type === "bullet_list_close") {
        listStack.pop();
        indentLevel--;
        continue;
      }
      if (token.type === "ordered_list_open") {
        const startAttr = token.attrs?.find((a) => a[0] === "start");
        const startIdx = startAttr ? parseInt(startAttr[1], 10) : 1;
        listStack.push({ type: "ordered", index: startIdx });
        indentLevel++;
        continue;
      }
      if (token.type === "ordered_list_close") {
        listStack.pop();
        indentLevel--;
        continue;
      }
      if (token.type === "blockquote_open") {
        inBlockquote = true;
        continue;
      }
      if (token.type === "blockquote_close") {
        inBlockquote = false;
        continue;
      }

      if (token.type === "hr") {
        const ruleText = "─".repeat(50);
        lines.push(new RichText(ruleText, [{ start: 0, end: ruleText.length, style: hrStyle }]));
        lines.push(new RichText(""));
        continue;
      }

      if (token.type === "fence" || token.type === "code_block") {
        const lang = token.info ? token.info.split(/\s+/)[0] : "text";
        const code = token.content.replace(/\r?\n$/, "");
        const syntaxLines = Syntax.renderToLines(code, lang, true, themeName);

        for (const line of syntaxLines) {
          let formattedLine = line;
          if (inBlockquote) {
            formattedLine = formatLine(formattedLine, "▌ ", [
              { start: 0, end: 2, style: quoteBarStyle },
            ]);
          }
          formattedLine = formatLine(formattedLine, "  ", []);
          lines.push(formattedLine);
        }
        lines.push(new RichText(""));
        continue;
      }

      // Headings
      if (token.type === "heading_open") {
        const level = parseInt(token.tag.substring(1), 10);
        const nextToken = tokens[i + 1];
        if (nextToken && nextToken.type === "inline") {
          const richHeader = processInline(nextToken.children || []);
          const hColor = headingColors[token.tag as keyof typeof headingColors] || "white";
          const headingStyle = new Style({ color: hColor, bold: true });

          const spans = richHeader.spans.map((s) => ({ ...s }));
          spans.push({ start: 0, end: richHeader.plain.length, style: headingStyle });

          let formattedLine = new RichText(richHeader.plain, spans);
          if (inBlockquote) {
            formattedLine = formatLine(formattedLine, "▌ ", [
              { start: 0, end: 2, style: quoteBarStyle },
            ]);
          }

          lines.push(formattedLine);

          if (level === 1 || level === 2) {
            const char = level === 1 ? "━" : "─";
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
          i++;
        }
        continue;
      }

      // Paragraphs
      if (token.type === "paragraph_open") {
        const nextToken = tokens[i + 1];
        if (nextToken && nextToken.type === "inline") {
          const richPara = processInline(nextToken.children || []);
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
          i++;
        }
        continue;
      }

      // List Items
      if (token.type === "list_item_open") {
        const nextToken = tokens[i + 1];
        if (nextToken && nextToken.type === "paragraph_open") {
          const inlineToken = tokens[i + 2];
          if (inlineToken && inlineToken.type === "inline") {
            const richItem = processInline(inlineToken.children || []);
            const currentList = listStack[listStack.length - 1];

            let prefix = "";
            const prefixSpans: Span[] = [];
            const indentSpaces = "  ".repeat(indentLevel - 1);

            if (currentList) {
              if (currentList.type === "bullet") {
                prefix = `${indentSpaces}  •  `;
                prefixSpans.push({
                  start: prefix.length - 3,
                  end: prefix.length - 2,
                  style: bulletStyle,
                });
              } else {
                const numStr = String(currentList.index++);
                prefix = `${indentSpaces}  ${numStr}. `;
                prefixSpans.push({
                  start: prefix.length - numStr.length - 2,
                  end: prefix.length,
                  style: numberStyle,
                });
              }
            }

            let formattedLine = formatLine(richItem, prefix, prefixSpans);
            if (inBlockquote) {
              formattedLine = formatLine(formattedLine, "▌ ", [
                { start: 0, end: 2, style: quoteBarStyle },
              ]);
            }

            lines.push(formattedLine);
            i += 3;
            if (tokens[i + 1] && tokens[i + 1].type === "list_item_close") {
              i++;
            }
          }
        }
      }
    }

    if (lines.length > 0 && lines[lines.length - 1].plain === "") {
      lines.pop();
    }

    return lines;
  }
}
