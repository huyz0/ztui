import { createRequire } from "node:module";
import type Prism from "prismjs";
import { Style } from "../style.ts";
import { RichText, type Span, splitRichTextIntoLines } from "./text.ts";

/**
 * `prismjs` is an optional peer dependency. It is loaded lazily on first use via
 * a synchronous `require` (prismjs is CommonJS, so this works under Node + Bun
 * and keeps the synchronous render path intact). When it is not installed,
 * `loadPrism()` returns null and `Syntax` degrades to plain, unhighlighted text.
 */
let prismRuntime: typeof Prism | null | undefined;
function loadPrism(): typeof Prism | null {
  if (prismRuntime !== undefined) return prismRuntime;
  try {
    const require = createRequire(import.meta.url);
    const P = require("prismjs") as typeof Prism;
    // Load language grammars (side effects register onto the Prism instance).
    require("prismjs/components/prism-markup.js");
    require("prismjs/components/prism-css.js");
    require("prismjs/components/prism-clike.js");
    require("prismjs/components/prism-javascript.js");
    require("prismjs/components/prism-typescript.js");
    require("prismjs/components/prism-json.js");
    require("prismjs/components/prism-python.js");
    require("prismjs/components/prism-go.js");
    require("prismjs/components/prism-rust.js");
    require("prismjs/components/prism-java.js");
    require("prismjs/components/prism-kotlin.js");
    require("prismjs/components/prism-toml.js");
    require("prismjs/components/prism-yaml.js");
    require("prismjs/components/prism-mermaid.js");
    require("prismjs/components/prism-plant-uml.js");
    require("prismjs/components/prism-sql.js");
    require("prismjs/components/prism-plsql.js");
    prismRuntime = P;
  } catch {
    prismRuntime = null;
  }
  return prismRuntime;
}

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

function getGrammar(P: typeof Prism, lang: string): Prism.Grammar | undefined {
  const normalized = lang.toLowerCase();
  if (normalized === "ts" || normalized === "typescript" || normalized === "tsx") {
    return P.languages.typescript;
  }
  if (normalized === "js" || normalized === "javascript" || normalized === "jsx") {
    return P.languages.javascript;
  }
  if (normalized === "json") {
    return P.languages.json;
  }
  if (normalized === "css") {
    return P.languages.css;
  }
  if (
    normalized === "html" ||
    normalized === "xml" ||
    normalized === "markup" ||
    normalized === "svg"
  ) {
    return P.languages.markup;
  }
  if (normalized === "py" || normalized === "python") {
    return P.languages.python;
  }
  if (normalized === "go" || normalized === "golang") {
    return P.languages.go;
  }
  if (normalized === "rs" || normalized === "rust") {
    return P.languages.rust;
  }
  if (normalized === "java") {
    return P.languages.java;
  }
  if (normalized === "kt" || normalized === "kotlin") {
    return P.languages.kotlin;
  }
  if (normalized === "toml") {
    return P.languages.toml;
  }
  if (normalized === "yaml" || normalized === "yml") {
    return P.languages.yaml;
  }
  if (normalized === "mermaid") {
    return P.languages.mermaid;
  }
  if (normalized === "plantuml" || normalized === "plant-uml") {
    return P.languages["plant-uml"];
  }
  if (
    normalized === "sql" ||
    normalized === "mysql" ||
    normalized === "pgsql" ||
    normalized === "postgres" ||
    normalized === "postgresql" ||
    normalized === "sqlite"
  ) {
    return P.languages.sql;
  }
  if (normalized === "plsql" || normalized === "pl-sql") {
    return P.languages.plsql;
  }
  return P.languages[normalized];
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
   * Tokenizing with Prism is pure but not cheap, and a widget re-highlights the
   * *same* code on every full frame (any repaint of a Syntax/Markdown-code block).
   * The result is theme-independent — spans carry `$token` style references
   * resolved later at paint — so a bounded memo keyed by (theme, language, code)
   * turns a per-frame `P.tokenize` into a Map hit. Bounded like the width/grapheme
   * caches: cleared wholesale past the cap so an adversarial stream of distinct
   * snippets can't grow it without bound.
   */
  private static highlightCache = new Map<string, RichText>();
  private static readonly HIGHLIGHT_CACHE_CAP = 512;

  /**
   * Highlights code syntax using Prism.js and returns a RichText instance.
   */
  public static highlight(code: string, language: string, _themeName = "theme"): RichText {
    const lang = language.toLowerCase();
    const cacheKey = `${_themeName}\0${lang}\0${code}`;
    const cached = Syntax.highlightCache.get(cacheKey);
    if (cached) return cached;

    const result = Syntax.highlightUncached(code, lang, language, _themeName);
    if (Syntax.highlightCache.size >= Syntax.HIGHLIGHT_CACHE_CAP) {
      Syntax.highlightCache.clear();
    }
    Syntax.highlightCache.set(cacheKey, result);
    return result;
  }

  /** The actual tokenize+span build behind {@link highlight}'s memo. */
  private static highlightUncached(
    code: string,
    lang: string,
    language: string,
    themeName: string,
  ): RichText {
    // Custom diff highlighter
    if (lang === "diff") {
      return Syntax.highlightDiff(code, themeName);
    }

    // prismjs is optional: without it, fall back to plain unhighlighted text.
    const P = loadPrism();
    if (!P) {
      return new RichText(code, []);
    }

    const theme = THEME_DYNAMIC_STYLE;
    const grammar = getGrammar(P, language);

    if (!grammar) {
      // Default unstyled text if no grammar matches
      return new RichText(code, []);
    }

    const tokens = P.tokenize(code, grammar);
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
