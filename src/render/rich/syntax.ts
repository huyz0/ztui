import Prism from "prismjs";
// Load Prism components
import "prismjs/components/prism-markup.js";
import "prismjs/components/prism-css.js";
import "prismjs/components/prism-clike.js";
import "prismjs/components/prism-javascript.js";
import "prismjs/components/prism-typescript.js";
import "prismjs/components/prism-json.js";
import "prismjs/components/prism-python.js";
import "prismjs/components/prism-go.js";
import "prismjs/components/prism-rust.js";
import "prismjs/components/prism-java.js";
import "prismjs/components/prism-kotlin.js";
import "prismjs/components/prism-toml.js";
import "prismjs/components/prism-yaml.js";
import "prismjs/components/prism-mermaid.js";
import "prismjs/components/prism-plant-uml.js";
import "prismjs/components/prism-sql.js";
import "prismjs/components/prism-plsql.js";

import { Style } from "../style.ts";
import { RichText, type Span, splitRichTextIntoLines } from "./text.ts";

const THEME_DYNAMIC_STYLE: Record<string, Style> = {
  comment: new Style({ color: "$comment", dim: true }),
  string: new Style({ color: "$string" }),
  keyword: new Style({ color: "$keyword", bold: true }),
  builtin: new Style({ color: "$builtin" }),
  number: new Style({ color: "$number" }),
  type: new Style({ color: "$type" }),
  operator: new Style({ color: "$operator" }),
  punctuation: new Style({ color: "$punctuation" }),
  property: new Style({ color: "$property" }),
  tag: new Style({ color: "$tag" }),
  "attr-name": new Style({ color: "$attr-name" }),
  boolean: new Style({ color: "$boolean", bold: true }),
  function: new Style({ color: "$function" }),
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
  if (
    normalized === "html" ||
    normalized === "xml" ||
    normalized === "markup" ||
    normalized === "svg"
  ) {
    return Prism.languages.markup;
  }
  if (normalized === "py" || normalized === "python") {
    return Prism.languages.python;
  }
  if (normalized === "go" || normalized === "golang") {
    return Prism.languages.go;
  }
  if (normalized === "rs" || normalized === "rust") {
    return Prism.languages.rust;
  }
  if (normalized === "java") {
    return Prism.languages.java;
  }
  if (normalized === "kt" || normalized === "kotlin") {
    return Prism.languages.kotlin;
  }
  if (normalized === "toml") {
    return Prism.languages.toml;
  }
  if (normalized === "yaml" || normalized === "yml") {
    return Prism.languages.yaml;
  }
  if (normalized === "mermaid") {
    return Prism.languages.mermaid;
  }
  if (normalized === "plantuml" || normalized === "plant-uml") {
    return Prism.languages["plant-uml"];
  }
  if (
    normalized === "sql" ||
    normalized === "mysql" ||
    normalized === "pgsql" ||
    normalized === "postgres" ||
    normalized === "postgresql" ||
    normalized === "sqlite"
  ) {
    return Prism.languages.sql;
  }
  if (normalized === "plsql" || normalized === "pl-sql") {
    return Prism.languages.plsql;
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
  public static highlight(code: string, language: string, _themeName = "theme"): RichText {
    const lang = language.toLowerCase();

    // Custom diff highlighter
    if (lang === "diff") {
      return Syntax.highlightDiff(code, _themeName);
    }

    const theme = THEME_DYNAMIC_STYLE;
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
  private static highlightDiff(code: string, _themeName: string): RichText {
    // Split while preserving the exact newline characters so span offsets stay
    // aligned with `code` (which may contain CRLF line endings).
    const rawLines = code.split(/(\r?\n)/);
    const spans: Span[] = [];

    const addedStyle = new Style({ color: "$diff-added" });
    const removedStyle = new Style({ color: "$diff-removed" });
    const headerStyle = new Style({ color: "$diff-header" });

    let currentOffset = 0;
    for (const part of rawLines) {
      // Newline separators captured by the split group: advance offset only.
      if (part === "\n" || part === "\r\n") {
        currentOffset += part.length;
        continue;
      }
      const line = part;
      const lineLength = line.length;

      if (line.startsWith("+")) {
        spans.push({ start: currentOffset, end: currentOffset + lineLength, style: addedStyle });
      } else if (line.startsWith("-")) {
        spans.push({ start: currentOffset, end: currentOffset + lineLength, style: removedStyle });
      } else if (line.startsWith("@@")) {
        spans.push({ start: currentOffset, end: currentOffset + lineLength, style: headerStyle });
      }

      currentOffset += lineLength;
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
    themeName = "theme",
  ): RichText[] {
    const highlighted = Syntax.highlight(code, language, themeName);
    const codeLines = splitRichTextIntoLines(highlighted);

    if (!lineNumbers) {
      return codeLines;
    }

    const totalLines = codeLines.length;
    const gutterWidth = Math.max(2, String(totalLines).length);
    const gutterStyle = new Style({ color: "$gutter", dim: true });

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
