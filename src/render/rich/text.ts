import { Segment } from "../segment.ts";
import { Style } from "../style.ts";

export interface Span {
  start: number;
  end: number;
  style: Style;
}

/**
 * Splits a string into three parts: [beforeSeparator, afterSeparator]
 */
const partition = (str: string, separator: string): [string, string] => {
  const idx = str.indexOf(separator);
  if (idx === -1) return [str, ""];
  return [str.substring(0, idx), str.substring(idx + separator.length)];
};

/**
 * Translates style descriptions (e.g. "bold red on white") into Style objects.
 */
export function parseStyleString(styleStr: string): Style {
  const parts = styleStr.split(/\s+/).filter(Boolean);
  const props: any = {};

  let i = 0;
  while (i < parts.length) {
    const part = parts[i];

    if (part === "bold") {
      props.bold = true;
    } else if (part === "italic") {
      props.italic = true;
    } else if (part === "underline") {
      props.underline = true;
    } else if (part === "undercurl" || part === "curly") {
      props.underlineStyle = "curly";
    } else if (
      part === "double-underline" ||
      part === "dotted-underline" ||
      part === "dashed-underline"
    ) {
      props.underlineStyle = part.slice(0, part.indexOf("-"));
    } else if (part.startsWith("underline=")) {
      // e.g. "underline=red" → coloured underline, independent of the foreground.
      props.underlineColor = part.substring(10);
    } else if (part === "reverse") {
      props.reverse = true;
    } else if (part === "dim") {
      props.dim = true;
    } else if (part === "strikethrough") {
      props.strikethrough = true;
    } else if (part === "on") {
      if (i + 1 < parts.length) {
        props.background = parts[i + 1];
        i++;
      }
    } else {
      if (part.startsWith("link=")) {
        props.link = part.substring(5);
      } else {
        props.color = part;
      }
    }
    i++;
  }

  return new Style(props);
}

export class RichText {
  public readonly plain: string;
  public readonly spans: Span[];

  constructor(plain: string, spans: Span[] = []) {
    this.plain = plain;
    this.spans = spans;
  }

  /**
   * Parse console markup (e.g., "[bold red]hello[/bold red]" or "[bold]hello[/]")
   * into a RichText instance. Supports escaping with backslashes.
   */
  public static fromMarkup(markup: string): RichText {
    const tagRegex = /(?:\\*)\[([a-zA-Z0-9#/@ _\-=.:/?&]+)\]/g;

    let plain = "";
    const spans: Span[] = [];
    const openTags: { name: string; styleStr: string; start: number }[] = [];

    let lastIndex = 0;
    let match = tagRegex.exec(markup);

    while (match !== null) {
      const fullMatch = match[0];
      const tagContent = match[1];
      const startOfMatch = match.index;

      const escapeMatch = fullMatch.match(/^\\+/);
      const backslashes = escapeMatch ? escapeMatch[0].length : 0;
      const isEscaped = backslashes % 2 !== 0;

      let textBefore = markup.substring(lastIndex, startOfMatch);
      const literalBackslashes = "\\".repeat(Math.floor(backslashes / 2));
      textBefore += literalBackslashes;

      plain += textBefore.replace(/\\\[/g, "[").replace(/\\\]/g, "]");

      if (isEscaped) {
        plain += `[${tagContent}]`;
        lastIndex = tagRegex.lastIndex;
        match = tagRegex.exec(markup);
        continue;
      }

      if (tagContent.startsWith("/")) {
        const nameToClose = tagContent.slice(1).trim().toLowerCase();
        let tagIndex = -1;

        if (nameToClose === "") {
          tagIndex = openTags.length - 1;
        } else {
          for (let i = openTags.length - 1; i >= 0; i--) {
            if (openTags[i].name === nameToClose) {
              tagIndex = i;
              break;
            }
          }
        }

        if (tagIndex !== -1) {
          const openTag = openTags[tagIndex];
          openTags.splice(tagIndex, 1);
          const style = parseStyleString(openTag.styleStr);
          spans.push({
            start: openTag.start,
            end: plain.length,
            style,
          });
        }
      } else {
        const [tagName] = partition(tagContent, "=");
        const name = tagName.trim().toLowerCase();
        openTags.push({
          name,
          styleStr: tagContent,
          start: plain.length,
        });
      }

      lastIndex = tagRegex.lastIndex;
      match = tagRegex.exec(markup);
    }

    const remainingText = markup.substring(lastIndex);
    plain += remainingText.replace(/\\\[/g, "[").replace(/\\\]/g, "]");

    while (openTags.length > 0) {
      const openTag = openTags.pop()!;
      const style = parseStyleString(openTag.styleStr);
      spans.push({
        start: openTag.start,
        end: plain.length,
        style,
      });
    }

    spans.sort((a, b) => a.start - b.start);
    return new RichText(plain, spans);
  }

  /**
   * Convert the RichText structure to rendering Segments.
   */
  public toSegments(baseStyle: Style = Style.DEFAULT): Segment[] {
    const text = this.plain;
    if (text.length === 0) return [];

    const endpoints: { offset: number; leaving: boolean; style: Style }[] = [];

    endpoints.push({ offset: 0, leaving: false, style: baseStyle });
    endpoints.push({ offset: text.length, leaving: true, style: baseStyle });

    for (const span of this.spans) {
      const start = Math.max(0, Math.min(text.length, span.start));
      const end = Math.max(0, Math.min(text.length, span.end));
      if (end > start) {
        endpoints.push({ offset: start, leaving: false, style: span.style });
        endpoints.push({ offset: end, leaving: true, style: span.style });
      }
    }

    endpoints.sort((a, b) => {
      if (a.offset !== b.offset) {
        return a.offset - b.offset;
      }
      if (a.leaving !== b.leaving) {
        return a.leaving ? -1 : 1;
      }
      return 0;
    });

    const segments: Segment[] = [];
    const activeStyles: Style[] = [];

    for (let i = 0; i < endpoints.length - 1; i++) {
      const current = endpoints[i];
      const next = endpoints[i + 1];

      if (current.leaving) {
        const idx = activeStyles.lastIndexOf(current.style);
        if (idx !== -1) {
          activeStyles.splice(idx, 1);
        }
      } else {
        activeStyles.push(current.style);
      }

      if (next.offset > current.offset) {
        let combined = new Style();
        for (const style of activeStyles) {
          combined = combined.merge(style);
        }

        const partText = text.substring(current.offset, next.offset);
        segments.push(new Segment(partText, combined));
      }
    }

    return segments;
  }
}

/**
 * Splits a RichText instance into lines of RichText instances.
 */
export function splitRichTextIntoLines(rich: RichText): RichText[] {
  const lines: RichText[] = [];
  const rawLines = rich.plain.split("\n");

  let lineStartOffset = 0;
  for (const rawLine of rawLines) {
    const lineEndOffset = lineStartOffset + rawLine.length;
    const lineSpans: Span[] = [];

    for (const span of rich.spans) {
      const overlapStart = Math.max(span.start, lineStartOffset);
      const overlapEnd = Math.min(span.end, lineEndOffset);

      if (overlapEnd > overlapStart) {
        lineSpans.push({
          start: overlapStart - lineStartOffset,
          end: overlapEnd - lineStartOffset,
          style: span.style,
        });
      }
    }

    lines.push(new RichText(rawLine, lineSpans));
    lineStartOffset = lineEndOffset + 1; // +1 to skip the newline character
  }

  return lines;
}
