import { describe, expect, test } from "vitest";
import { Markdown, parseInlineMarkdown } from "./markdown.ts";

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
    expect(lines[0].spans[0].style.color).toBe("blue");
    expect(lines[0].spans[0].style.dim).toBe(true);
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
});
