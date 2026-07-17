import { describe, expect, test } from "vitest";
import { Markdown, parseInlineMarkdown, tokensToMarkup } from "./markdown.ts";

describe("Markdown Engine", () => {
  test("parseInlineMarkdown translates styles", () => {
    const text = "Hello **bold** and *italic* and `code` and [google](http://google.com)";
    const markup = parseInlineMarkdown(text);

    expect(markup).toBe(
      "Hello [bold]bold[/] and [italic]italic[/] and [dim cyan]code[/] and [link=http://google.com]google[/]",
    );
  });

  test("Markdown.renderToLines parses headers", () => {
    const mdText = "# Title 1\n## Title 2\n### Title 3";
    const lines = Markdown.renderToLines(mdText);

    // H1 has header line + underline + newline, H2 has header + underline + newline, H3 has header + newline
    // N = 1 (H1) + 1 (rule) + 1 (blank) + 1 (H2) + 1 (rule) + 1 (blank) + 1 (H3)
    expect(lines.length).toBe(7);

    expect(lines[0].plain).toBe("Title 1");
    // Verify underline for H1
    expect(lines[1].plain.startsWith("━")).toBe(true);

    expect(lines[3].plain).toBe("Title 2");
    // Verify underline for H2
    expect(lines[4].plain.startsWith("─")).toBe(true);

    expect(lines[6].plain).toBe("Title 3");
  });

  test("Markdown.renderToLines parses blockquotes", () => {
    const mdText = "> This is a quote";
    const lines = Markdown.renderToLines(mdText);

    expect(lines.length).toBe(1);
    expect(lines[0].plain).toBe("▌ This is a quote");
    expect(lines[0].spans[0].style.color).toBe("$secondary");
  });

  test("Markdown.renderToLines parses bullet and ordered lists", () => {
    const mdText = "- bullet item\n1. first ordered\n2. second ordered";
    const lines = Markdown.renderToLines(mdText);

    expect(lines.length).toBe(3);

    // Bullet list formatting
    expect(lines[0].plain).toBe("  •  bullet item");

    // Ordered list formatting with index counter
    expect(lines[1].plain).toBe("  1. first ordered");
    expect(lines[2].plain).toBe("  2. second ordered");
  });

  test("Markdown.renderToLines parses code block fences", () => {
    const mdText = "```ts\nconst val = 1;\n```";
    const lines = Markdown.renderToLines(mdText);

    // With borders, the code block rendering has 3 lines: top border, code line, bottom border
    expect(lines.length).toBe(3);
    expect(lines[1].plain).toContain("const val = 1;");
    expect(lines[1].spans.length).toBeGreaterThan(0);
  });

  test("Markdown.renderToLines renders borderless tables with alignment + zebra", () => {
    const mdText =
      "| Name | Status | Latency |\n|------|:------:|--------:|\n| alice | active | 12ms |\n| bob | idle | 4ms |";
    const lines = Markdown.renderToLines(mdText);

    // header, underline rule, two body rows, trailing blank is popped → 4 lines
    expect(lines[0].plain).toContain("Name");
    expect(lines[0].spans.some((s) => s.style.bold && s.style.color === "$accent")).toBe(true);

    // header underline made only of box-drawing dashes
    expect(/^─+$/.test(lines[1].plain)).toBe(true);

    // right-aligned latency column: value hugs the right edge
    const alice = lines.find((l) => l.plain.includes("alice"))!;
    expect(alice.plain.trimEnd().endsWith("12ms")).toBe(true);

    // zebra: the second body row (odd index) gets a panel background span
    const bob = lines.find((l) => l.plain.includes("bob"))!;
    expect(bob.spans.some((s) => s.style.background === "$panel")).toBe(true);
  });

  test("Markdown.renderToLines additional inline/block coverages", () => {
    const mdText = `# Header 1
> # Header 1 inside blockquote
> ## Header 2 inside blockquote
> block with **bold**, *italic*, ~~strikethrough~~, \`inline code\`, [link](http://domain), and ![img](img.png).
> softbreak here
> hardbreak here\\
> after break
>
> ---
>
> \`\`\`ts
> const codeInQuote = 1;
> \`\`\`
>
> - item 1
> - item 2
**unbalanced bold`;

    const lines = Markdown.renderToLines(mdText);
    expect(lines.length).toBeGreaterThan(0);

    // Verify thematic break rule in blockquote
    const hrLine = lines.find((l) => l.plain.includes("─") && l.plain.includes("▌"));
    expect(hrLine).toBeDefined();
  });

  test("tokensToMarkup handles undefined token list", () => {
    expect(tokensToMarkup(undefined)).toBe("");
  });

  test("tokensToMarkup falls back for link/image without href or alt text", () => {
    const markup = tokensToMarkup([
      { type: "link", href: "", tokens: [{ type: "text", text: "bare link" }] } as any,
      { type: "image", href: "", text: "" } as any,
    ]);
    expect(markup).toContain("[bright-blue underline link=]bare link[/]");
    expect(markup).toContain("🖼️  image ()");
  });

  test("tokensToMarkup handles escape, br, generic tokens-passthrough, and raw fallback", () => {
    const markup = tokensToMarkup([
      { type: "escape", text: "&amp;" } as any,
      { type: "br" } as any,
      { type: "unknown-with-tokens", tokens: [{ type: "text", text: "nested" }] } as any,
      { type: "unknown-raw", raw: "raw-fallback" } as any,
    ]);
    expect(markup).toBe("&amp;\nnestedraw-fallback");
  });

  test("Markdown.renderToLines renders fenced code block with no language as plain text", () => {
    const mdText = "```\nplain block\n```";
    const lines = Markdown.renderToLines(mdText);
    expect(lines[1].plain).toContain("plain block");
  });

  test("Markdown.renderToLines handles a top-level (non-blockquote) paragraph", () => {
    const mdText = "just a plain paragraph";
    const lines = Markdown.renderToLines(mdText);
    expect(lines[0].plain).toBe("just a plain paragraph");
  });

  test("Markdown.renderToLines handles ragged table rows with fewer cells than the header", () => {
    const mdText = "| A | B | C |\n|---|---|---|\n| 1 |\n";
    const lines = Markdown.renderToLines(mdText);
    expect(lines[0].plain).toContain("A");
    // The ragged row should still render without throwing, padding missing cells as blank.
    const raggedRow = lines.find((l) => l.plain.trimStart().startsWith("1"));
    expect(raggedRow).toBeDefined();
  });

  test("Markdown.renderToLines handles an ordered list with an explicit start index", () => {
    const mdText = "5. fifth\n6. sixth";
    const lines = Markdown.renderToLines(mdText);
    expect(lines[0].plain).toBe("  5. fifth");
    expect(lines[1].plain).toBe("  6. sixth");
  });

  test("Markdown.renderToLines handles a list item containing only a nested sub-list", () => {
    const mdText = "- outer\n  - inner a\n  - inner b";
    const lines = Markdown.renderToLines(mdText);
    expect(lines[0].plain).toBe("  •  outer");
    expect(lines.some((l) => l.plain.includes("inner a"))).toBe(true);
    expect(lines.some((l) => l.plain.includes("inner b"))).toBe(true);
  });
});
