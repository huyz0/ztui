import Prism from "prismjs";
// Load Prism components
import "prismjs/components/prism-markup.js";
import "prismjs/components/prism-css.js";
import "prismjs/components/prism-clike.js";
import "prismjs/components/prism-javascript.js";
import "prismjs/components/prism-typescript.js";
import "prismjs/components/prism-json.js";

import { Style } from "../style.ts";
import { RichText, type Span, splitRichTextIntoLines } from "./text.ts";

const ANSI_DARK_THEME: Record<string, Style> = {
  comment: new Style({ dim: true, color: "gray" }),
  string: new Style({ color: "bright-yellow" }),
  keyword: new Style({ color: "bright-cyan", bold: true }),
  builtin: new Style({ color: "bright-blue" }),
  number: new Style({ color: "bright-green" }),
  type: new Style({ color: "bright-magenta" }),
  operator: new Style({ color: "white" }),
  punctuation: new Style({ color: "gray" }),
  property: new Style({ color: "bright-magenta" }),
  tag: new Style({ color: "bright-blue" }),
  "attr-name": new Style({ color: "bright-yellow" }),
  boolean: new Style({ color: "bright-cyan", bold: true }),
  function: new Style({ color: "bright-green" }),
};

const ANSI_LIGHT_THEME: Record<string, Style> = {
  comment: new Style({ dim: true, color: "gray" }),
  string: new Style({ color: "yellow" }),
  keyword: new Style({ color: "cyan", bold: true }),
  builtin: new Style({ color: "blue" }),
  number: new Style({ color: "green" }),
  type: new Style({ color: "magenta" }),
  operator: new Style({ color: "black" }),
  punctuation: new Style({ color: "gray" }),
  property: new Style({ color: "magenta" }),
  tag: new Style({ color: "blue" }),
  "attr-name": new Style({ color: "yellow" }),
  boolean: new Style({ color: "cyan", bold: true }),
  function: new Style({ color: "green" }),
};

function getGrammar(lang: string): Prism.Grammar | undefined {
  const normalized = lang.toLowerCase();
  if (normalized === "ts" || normalized === "typescript" || normalized === "tsx") {
    return Prism.languages.typescript;
  }
  if (normalized === "js" || normalized === "javascript" || normalized === "jsx") {
    return Prism.languages.javascript;
  }
  if (normalized === "json") {
    return Prism.languages.json;
  }
  if (normalized === "css") {
    return Prism.languages.css;
  }
  if (normalized === "html" || normalized === "xml" || normalized === "markup") {
    return Prism.languages.markup;
  }
  return Prism.languages[normalized];
}

function traverseTokens(
  token: string | Prism.Token,
  offset: number,
  theme: Record<string, Style>,
  spans: Span[],
): number {
  if (typeof token === "string") {
    return token.length;
  }

  const start = offset;
  let len = 0;

  if (Array.isArray(token.content)) {
    let currentOffset = offset;
    for (const child of token.content) {
      currentOffset += traverseTokens(child, currentOffset, theme, spans);
    }
    len = currentOffset - offset;
  } else {
    len = traverseTokens(token.content, offset, theme, spans);
  }

  const style = theme[token.type];
  if (style) {
    spans.push({
      start,
      end: start + len,
      style,
    });
  }

  return len;
}

// biome-ignore lint/complexity/noStaticOnlyClass: aligns with class-based Python rich reference
export class Syntax {
  /**
   * Highlights code syntax using Prism.js and returns a RichText instance.
   */
  public static highlight(
    code: string,
    language: string,
    themeName: "ansi_dark" | "ansi_light" = "ansi_dark",
  ): RichText {
    const lang = language.toLowerCase();

    // Custom diff highlighter
    if (lang === "diff") {
      return Syntax.highlightDiff(code, themeName);
    }

    const theme = themeName === "ansi_light" ? ANSI_LIGHT_THEME : ANSI_DARK_THEME;
    const grammar = getGrammar(language);

    if (!grammar) {
      // Default unstyled text if no grammar matches
      return new RichText(code, []);
    }

    const tokens = Prism.tokenize(code, grammar);
    const spans: Span[] = [];

    let currentOffset = 0;
    for (const token of tokens) {
      currentOffset += traverseTokens(token, currentOffset, theme, spans);
    }

    // Sort spans by start offset
    spans.sort((a, b) => a.start - b.start);

    return new RichText(code, spans);
  }

  /**
   * Highlights diff code block line-by-line.
   */
  private static highlightDiff(code: string, themeName: "ansi_dark" | "ansi_light"): RichText {
    const rawLines = code.split(/\r?\n/);
    const spans: Span[] = [];

    const addedStyle = new Style({ color: themeName === "ansi_light" ? "green" : "bright-green" });
    const removedStyle = new Style({ color: themeName === "ansi_light" ? "red" : "bright-red" });
    const headerStyle = new Style({ color: "cyan" });

    let currentOffset = 0;
    for (const line of rawLines) {
      const lineLength = line.length;

      if (line.startsWith("+")) {
        spans.push({ start: currentOffset, end: currentOffset + lineLength, style: addedStyle });
      } else if (line.startsWith("-")) {
        spans.push({ start: currentOffset, end: currentOffset + lineLength, style: removedStyle });
      } else if (line.startsWith("@@")) {
        spans.push({ start: currentOffset, end: currentOffset + lineLength, style: headerStyle });
      }

      currentOffset += lineLength + 1; // +1 for the newline
    }

    return new RichText(code, spans);
  }

  /**
   * Generates line-by-line RichText objects with code highlighting and gutters.
   */
  public static renderToLines(
    code: string,
    language: string,
    lineNumbers = false,
    themeName: "ansi_dark" | "ansi_light" = "ansi_dark",
  ): RichText[] {
    const highlighted = Syntax.highlight(code, language, themeName);
    const codeLines = splitRichTextIntoLines(highlighted);

    if (!lineNumbers) {
      return codeLines;
    }

    const totalLines = codeLines.length;
    const gutterWidth = Math.max(2, String(totalLines).length);
    const gutterStyle = new Style({ color: "gray", dim: true });

    return codeLines.map((line, idx) => {
      const lineNumStr = String(idx + 1).padStart(gutterWidth);
      const gutterText = `${lineNumStr} │ `;
      const gutterSpan = {
        start: 0,
        end: gutterText.length,
        style: gutterStyle,
      };

      const shiftedSpans = line.spans.map((s) => ({
        start: s.start + gutterText.length,
        end: s.end + gutterText.length,
        style: s.style,
      }));

      return new RichText(gutterText + line.plain, [gutterSpan, ...shiftedSpans]);
    });
  }
}
