import { describe, expect, test } from "vitest";
import { App } from "../../core/app.ts";
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

    // The code block should have highlighted spans
    // Code block inside markdown gets indented: "  1 │ const val = 1;"
    expect(lines.length).toBe(1); // code line (trailing blank line popped)
    expect(lines[0].plain).toContain("const val = 1;");
    expect(lines[0].spans.length).toBeGreaterThan(0);
  });

  test("Markdown.renderToLines parses nested mermaid block in ASCII fallback mode", () => {
    const originalApp = App.instance;
    App.instance = null; // Force ASCII fallback

    const mdText = "```mermaid\ngraph TD\nA --> B\n```";
    const lines = Markdown.renderToLines(mdText);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0].plain).toContain("┌──");
    expect(lines[0].spans[0].style.color).toBe("bright-cyan");

    App.instance = originalApp;
  });

  test("Markdown.renderToLines parses nested mermaid block in Graphics mode", () => {
    const originalApp = App.instance;
    const mockApp = {
      driver: {
        capabilities: {
          graphicsProtocol: "kitty",
          cellSize: { width: 8, height: 16 },
        },
      },
    };
    App.instance = mockApp as any;

    const mdText = "```mermaid\ngraph TD\nA --> B\n```";
    const lines = Markdown.renderToLines(mdText);

    expect(lines.length).toBe(1); // the graphic placeholder line (trailing blank line popped)
    expect((lines[0] as any).graphic).toBeDefined();
    expect((lines[0] as any).graphic.type).toBe("image");
    expect((lines[0] as any).graphic.cellWidth).toBe(40);
    expect((lines[0] as any).graphic.cellHeight).toBe(12);

    App.instance = originalApp;
  });
});
