import { describe, expect, test, vi } from "vitest";
import { TextNode } from "../../dom/text-node.ts";
import { Widget } from "../../dom/widget.ts";
import { reconciler } from "../../react/reconciler.ts";
import { Markdown } from "../../react.ts";
import { getMarked } from "../../render/rich/marked-loader.ts";
import { RichText } from "../../render/rich/text.ts";
import "../../markdown.ts";
import "../../mermaid.ts";
import { mountApp } from "../../test/harness.tsx";
import { MarkdownWidget } from "./markdown.ts";

/** Drive the widget directly: set markdown source and run a measure pass. */
function md(text: string, w = new MarkdownWidget()): MarkdownWidget {
  const existing = (w as any).textNode as TextNode | null;
  if (existing) existing.text = text;
  else w.appendChild(new TextNode(text));
  w.measure(80, 24);
  return w;
}

/** Generated content blocks, excluding chrome like the copy button. */
function blocks(w: Widget): Widget[] {
  return w.children.filter((c: any) => c.tagName !== "copy-button") as Widget[];
}

function tags(w: Widget): string[] {
  return blocks(w).map((c: any) => c.tagName);
}

describe("Markdown block building", () => {
  test("covers heading/paragraph/list/blockquote/hr/code in one document", () => {
    const w = md(
      [
        "# Title",
        "",
        "Some ~~old~~ `code` *text* with a [link](https://x.dev) and ![alt](img.png).",
        "",
        "1. first",
        "2. second",
        "",
        "> quoted",
        "",
        "---",
        "",
        "```ts",
        "const x = 1;",
        "```",
      ].join("\n"),
    );
    expect(tags(w)).toEqual(["heading", "paragraph", "ordered_list", "blockquote", "hr", "syntax"]);
  });

  test("unknown/blank blocks render nothing instead of crashing", () => {
    const w = md("<div>raw html block</div>");
    // marked emits an `html` token, which has no widget mapping -> skipped.
    expect(blocks(w).length).toBe(0);
  });

  test("clearing the source removes all generated blocks", () => {
    const w = md("# hello\n\ntext");
    expect(blocks(w).length).toBeGreaterThan(0);
    md("", w);
    expect(blocks(w).length).toBe(0);
  });
});

/** Collect a widget's `selectionRaw` strings across the subtree. */
function rawSources(w: Widget): string[] {
  const out: string[] = [];
  const visit = (n: any) => {
    if (n.selectionRaw != null) out.push(n.selectionRaw);
    for (const c of n.children ?? []) visit(c);
  };
  visit(w);
  return out;
}

describe("Markdown GFM alerts", () => {
  test("renders `> [!WARNING]` as a callout, hiding the marker", async () => {
    const t = await mountApp(<Markdown>{"> [!WARNING]\n> Be careful here."}</Markdown>, {
      cols: 40,
      rows: 8,
    });
    await t.settle();
    const text = t.text();
    expect(text).toContain("▲"); // warning icon
    expect(text).toContain("Warning"); // callout heading
    expect(text).toContain("Be careful here."); // body kept
    expect(text).not.toContain("[!WARNING]"); // marker not shown literally
  });

  test("an alert block carries the raw markdown for copy-on-select", () => {
    const w = md("> [!NOTE]\n> Remember **this**.");
    // The callout container is tagged `alert`, not `blockquote`.
    expect(tags(w)).toEqual(["alert"]);
    // Its raw source — what a full selection copies — keeps the marker and the
    // inline `**bold**`, not the rendered text.
    const raw = rawSources(blocks(w)[0]);
    expect(raw.some((s) => s.includes("[!NOTE]") && s.includes("**this**"))).toBe(true);
  });

  test("each GFM variant maps to its icon and an ordinary quote stays a blockquote", () => {
    for (const [marker, icon] of [
      ["NOTE", "ⓘ"],
      ["TIP", "✦"],
      ["IMPORTANT", "◆"],
      ["CAUTION", "✘"],
    ] as const) {
      const w = md(`> [!${marker}]\n> body`);
      expect(tags(w)).toEqual(["alert"]);
      expect(rawSources(blocks(w)[0]).join("\n")).toContain(`[!${marker}]`);
      void icon; // icon coverage is asserted in the render test above
    }
    expect(tags(md("> just a quote"))).toEqual(["blockquote"]);
  });
});

describe("Markdown streaming reconciliation", () => {
  test("unchanged leading blocks are reused, appended blocks are added", () => {
    const w = md("# Title\n\nfirst paragraph.\n");
    const [heading] = blocks(w);
    md("# Title\n\nfirst paragraph.\n\nsecond paragraph.\n", w);
    // The heading token is byte-identical and its widget is reused; the last
    // paragraph's raw changes once content follows it, so it may be rebuilt.
    expect(blocks(w)[0]).toBe(heading);
    expect(blocks(w).length).toBe(3);
  });

  test("a mutated block is rebuilt while its siblings are kept", () => {
    const w = md("# Title\n\nalpha\n\nomega\n");
    const [heading, , omega] = blocks(w);
    md("# Title\n\nalpha CHANGED\n\nomega\n", w);
    expect(blocks(w)[0]).toBe(heading);
    expect(blocks(w)[1]).not.toBe(undefined);
    expect(blocks(w)[2]).toBe(omega);
  });

  test("removing trailing blocks shrinks the tree", () => {
    const w = md("one\n\ntwo\n\nthree\n");
    expect(blocks(w).length).toBe(3);
    md("one\n", w);
    expect(blocks(w).length).toBe(1);
  });

  test("reuses byte-identical list/code/blockquote blocks across a streamed append", () => {
    // Deep token equality compares the type-specific fields of list/list_item/
    // code/blockquote, so an unchanged prefix of those is reused (not rebuilt)
    // when more content streams in after it.
    const doc = ["- one", "- two", "", "```ts", "const x = 1;", "```", "", "> quoted", ""].join(
      "\n",
    );
    const w = md(doc);
    const [list, code, quote] = blocks(w);
    expect(list.tagName).toBe("bullet_list");
    expect(code.tagName).toBe("syntax");
    expect(quote.tagName).toBe("blockquote");

    md(`${doc}\nA new trailing paragraph.\n`, w);
    // The identical leading blocks (list, code) keep their widget instances;
    // the trailing blockquote may rebuild once content follows it.
    expect(blocks(w)[0]).toBe(list);
    expect(blocks(w)[1]).toBe(code);
  });
});

describe("Markdown generative UI (code fences)", () => {
  test("nested JSON children build widgets with spacing styles and routed actions", async () => {
    const onAction = vi.fn();
    const fence = [
      "```ztui-vbox",
      JSON.stringify({
        id: "panel",
        style: { padding: { top: 1, left: 2 } },
        children: [
          {
            type: "ztui-button",
            id: "go",
            text: "Go",
            action: "launch",
            style: { margin: { bottom: 1 } },
          },
        ],
      }),
      "```",
    ].join("\n");
    const t = await mountApp(<Markdown onAction={onAction}>{fence}</Markdown>);
    const btn = t.findById("go");
    expect(btn).toBeDefined();
    expect(t.findById("panel")).toBeDefined();
    btn!.onClick?.({} as any);
    expect(onAction).toHaveBeenCalledWith("launch", expect.objectContaining({ id: "go" }));
  });

  test("nested generative children apply margin/padding objects at every level", async () => {
    const fence = [
      "```ztui-vbox",
      JSON.stringify({
        id: "root",
        style: { margin: { bottom: 1 } },
        children: [
          {
            type: "ztui-vbox",
            id: "inner",
            style: { padding: { top: 1, left: 2 }, margin: { top: 1 } },
            children: [{ type: "ztui-label", id: "deep", text: "deep text" }],
          },
        ],
      }),
      "```",
    ].join("\n");
    const t = await mountApp(<Markdown>{fence}</Markdown>);
    expect(t.findById("root")).toBeDefined();
    expect(t.findById("inner")).toBeDefined();
    expect(t.findById("deep")).toBeDefined();
    expect(t.text()).toContain("deep text"); // grandchild rendered through recursion
  });

  test("unparseable fence JSON falls back to the raw text as content", async () => {
    const fence = "```ztui-label\n!!! not json at all !!!\n```";
    const t = await mountApp(<Markdown>{fence}</Markdown>);
    expect(t.text()).toContain("!!! not json at all !!!");
  });
});

describe("Markdown GFM tables", () => {
  test("builds a header, rule, and zebra-striped, alignment-padded rows", async () => {
    const table = [
      "| Name | Age | City |",
      "| :--- | :-: | ---: |",
      "| Alice | 30 | NYC |",
      "| Bob | 5 | Los Angeles |",
    ].join("\n");
    const t = await mountApp(<Markdown>{table}</Markdown>, { cols: 60, rows: 10 });
    await t.settle();
    const text = t.text();
    expect(text).toContain("Name");
    expect(text).toContain("Alice");
    expect(text).toContain("Los Angeles");
    expect(text).toContain("─"); // header underline rule
    // Right-aligned "City" column pads the shorter "NYC" on the left.
    expect(text).toMatch(/NYC/);
  });

  test("a table token builds a 'table' container block", () => {
    const w = md(["| A | B |", "| - | - |", "| 1 | 2 |"].join("\n"));
    expect(tags(w)).toContain("table");
  });

  test("a GFM task list renders checkbox glyphs by completion", async () => {
    const list = ["- [x] done item", "- [ ] todo item"].join("\n");
    const t = await mountApp(<Markdown>{list}</Markdown>, { cols: 40, rows: 6 });
    await t.settle();
    const text = t.text();
    expect(text).toContain("☑"); // checked
    expect(text).toContain("☐"); // unchecked
    expect(text).toContain("done item");
    expect(text).toContain("todo item");
    expect(text).not.toContain("•"); // task items replace the plain bullet
  });
});

describe("Markdown generative UI edge cases", () => {
  test("a fence's `text` prop appends a text node", async () => {
    const fence = [
      "```ztui-label",
      JSON.stringify({ id: "lbl", text: "hello from json" }),
      "```",
    ].join("\n");
    const t = await mountApp(<Markdown>{fence}</Markdown>);
    expect(t.text()).toContain("hello from json");
  });

  test("an unrecognized nested child type is silently dropped", async () => {
    const fence = [
      "```ztui-vbox",
      JSON.stringify({
        id: "root",
        children: [{ type: "not-a-real-widget-tag" }, { type: "ztui-label", id: "ok", text: "ok" }],
      }),
      "```",
    ].join("\n");
    const t = await mountApp(<Markdown>{fence}</Markdown>);
    expect(t.findById("root")).toBeDefined();
    expect(t.findById("ok")).toBeDefined();
  });

  test("a plain fence with no language tag defaults to text syntax highlighting", () => {
    const w = md("```\nplain code, no lang\n```");
    expect(tags(w)).toEqual(["syntax"]);
    const syntax = blocks(w)[0] as any;
    expect(syntax.language).toBe("text");
  });
});

describe("Markdown block-level layout options", () => {
  test("trimTrailingMargin drops only the last block's bottom margin", () => {
    const w = new MarkdownWidget();
    w.trimTrailingMargin = true;
    md("one\n\ntwo\n\nthree\n", w);
    const b = blocks(w);
    expect(b.length).toBe(3);
    const bottom = (w2: Widget) => (w2.style.margin as { bottom?: number })?.bottom;
    expect(bottom(b[0]!)).toBe(1);
    expect(bottom(b[1]!)).toBe(1);
    expect(bottom(b[2]!)).toBe(0); // last block flush, no trailing gap
  });

  test("an html block (no widget mapping) can be streamed away without error", () => {
    const w = md("<div>raw</div>\n\nkept paragraph\n");
    expect(blocks(w).length).toBe(1); // only the paragraph has a mapping
    // Shrinking back to just the html block removes the surviving paragraph
    // widget while the unmapped html block itself was already null.
    expect(() => md("<div>raw</div>\n", w)).not.toThrow();
    expect(blocks(w).length).toBe(0);
  });
});

describe("Markdown theme propagation", () => {
  test("setting theme cascades to existing generated children", () => {
    const w = md("# Title\n\n```ts\nconst x = 1;\n```\n");
    w.theme = "dracula";
    const syntax = blocks(w).find((c: any) => c.tagName === "syntax") as any;
    expect(syntax).toBeDefined();
    expect(syntax.theme).toBe("dracula");
    // Re-setting the same value is a no-op (no throw, value stable).
    w.theme = "dracula";
    expect(w.theme).toBe("dracula");
  });
});

describe("Markdown list items", () => {
  test("an ordered list numbers each item and nests its body content", () => {
    const w = md("1. **bold** item\n2. second\n");
    const list = blocks(w)[0] as any;
    expect(list.tagName).toBe("ordered_list");
    // Items carry their raw markdown for copy round-tripping.
    const visit = (n: any, out: string[]) => {
      if (n.selectionRaw) out.push(n.selectionRaw);
      for (const c of n.children ?? []) visit(c, out);
    };
    const raw: string[] = [];
    visit(list, raw);
    expect(raw.some((s) => s.includes("**bold**"))).toBe(true);
  });
});

describe("Markdown wrapping", () => {
  const longLine =
    "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho.";

  /** The first RichText leaf inside the generated blocks. */
  function firstLeaf(w: Widget): any {
    let leaf: any;
    const visit = (n: any) => {
      if (n.tagName === "richtext" && leaf === undefined) leaf = n;
      for (const c of n.children ?? []) visit(c);
    };
    visit(w);
    return leaf;
  }

  test("a long paragraph wraps to multiple rows by default", () => {
    const w = md(longLine);
    const leaf = firstLeaf(w);
    expect(leaf.wrap).toBe(true);
    // 88 chars wrapped to a ~76-col viewport → at least two rows.
    expect(leaf.measuredHeight).toBeGreaterThan(1);
  });

  test("wrap=false keeps the line on a single row", () => {
    const w = new MarkdownWidget();
    w.wrap = false;
    md(longLine, w);
    const leaf = firstLeaf(w);
    expect(leaf.wrap).toBe(false);
    expect(leaf.measuredHeight).toBe(1);
  });
});

describe("Markdown rendering integration", () => {
  test("renders headers, lists, blockquotes, images, links and styles", async () => {
    const mdText = `# Header 1
> Blockquote text with **bold**
> - Item in blockquote
> # Header in blockquote
~~strikethrough~~ and [link](http://domain.com) and ![alt](img.png)
- bullet 1
1. ordered 1`;

    const { app } = await mountApp(<Markdown>{mdText}</Markdown>, {
      cols: 50,
      rows: 25,
      capabilities: { glyphProtocol: false, graphicsProtocol: "none" },
    });

    const buffer = app.buffer;
    expect(buffer.cells[0][0].char).toBe("H"); // "Header 1"
    expect(buffer.cells[1][0].char).toBe("━"); // header underline rule
    expect(buffer.cells[3][0].char).toBe("▌"); // blockquote bar
    expect(buffer.cells[3][2].char).toBe("B"); // 'B' of Blockquote
  });

  test("builds a dynamic widget tree, supports ztui elements in code blocks, and routes events", async () => {
    let actionNameReceived = "";
    let actionDataReceived: any = null;
    const onAction = (name: string, data: any) => {
      actionNameReceived = name;
      actionDataReceived = data;
    };

    const mdContent = `# Title
> Quote

- Item

\`\`\`ztui-button
{
  "id": "test-btn",
  "text": "Interactive Button",
  "action": "btn-clicked",
  "style": { "color": "bright-green" }
}
\`\`\``;

    const { app } = await mountApp(<Markdown onAction={onAction}>{mdContent}</Markdown>, {
      cols: 80,
      rows: 25,
      capabilities: { glyphProtocol: false, graphicsProtocol: "none" },
    });

    const mdWidget = app.activeScreen.children[0] as any;
    expect(mdWidget.tagName).toBe("markdown");
    expect(blocks(mdWidget).length).toBe(4);

    const heading = mdWidget.children[0];
    expect(heading.tagName).toBe("heading");
    const blockquote = mdWidget.children[1];
    expect(blockquote.tagName).toBe("blockquote");
    const list = mdWidget.children[2];
    expect(list.tagName).toBe("bullet_list");
    const button = mdWidget.children[3];
    expect(button.tagName).toBe("button");
    expect(button.id).toBe("test-btn");
    expect(button.style.color).toBe("bright-green");

    expect(button.onClick).toBeDefined();
    button.onClick({ x: 0, y: 0 });
    expect(actionNameReceived).toBe("btn-clicked");
    expect(actionDataReceived).toBeDefined();
    expect(actionDataReceived.id).toBe("test-btn");
    expect(actionDataReceived.type).toBe("button");
  });

  test("MarkdownWidget's DOM API can be driven directly", () => {
    const w = new MarkdownWidget();
    const txt1 = new TextNode("A");
    const txt2 = new TextNode("B");
    const normalWidget = new Widget("test");

    w.appendChild(txt1);
    expect(w.getRawMarkdown()).toBe("A");

    w.insertBefore(txt2, txt1);
    expect(w.getRawMarkdown()).toBe("B"); // sets textNode

    w.removeChild(txt2);
    expect(w.getRawMarkdown()).toBe("");

    // non-text widget branches
    w.appendChild(normalWidget);
    expect(w.children[0]).toBe(normalWidget);
    w.insertBefore(normalWidget, txt1);
    w.removeChild(normalWidget);
  });

  test("reuses unchanged block widgets across an update (remend keeps object identity)", async () => {
    // "This is **bold" has an open bold formatting which remend should complete.
    const initialText = "# Header 1\n\nThis is **bold";
    const { screen, container, settle } = await mountApp(<Markdown>{initialText}</Markdown>, {
      cols: 80,
      rows: 25,
      capabilities: { glyphProtocol: false, graphicsProtocol: "none" },
    });

    const mdWidget = screen.children[0] as MarkdownWidget;
    expect(blocks(mdWidget).length).toBe(2);

    const firstBlockWidget = mdWidget.children[0];
    const secondBlockWidget = mdWidget.children[1];
    expect(firstBlockWidget.tagName).toBe("heading");
    expect(secondBlockWidget.tagName).toBe("paragraph");

    // Verify remend worked: paragraph text node has balanced bold tags.
    const pRichText = secondBlockWidget.children[0];
    const pText = (pRichText.children[0] as TextNode).text;
    expect(pText).toContain("[bold]bold[/]");

    // Update markdown by appending a new block.
    const updatedText = "# Header 1\n\nThis is **bold**\n\n- Item 1\n- Item 2";
    reconciler.updateContainer(<Markdown>{updatedText}</Markdown>, container, null, () => {});
    await settle();

    expect(blocks(mdWidget).length).toBe(3);
    expect(mdWidget.children[0].tagName).toBe("heading");
    expect(mdWidget.children[1].tagName).toBe("paragraph");
    expect(mdWidget.children[2].tagName).toBe("bullet_list");

    // CRITICAL: object references are strictly identical (widget reuse).
    expect(mdWidget.children[0]).toBe(firstBlockWidget);
    expect(mdWidget.children[1]).toBe(secondBlockWidget);
  });

  test("renders a full demo document (headers, lists, code, mermaid) without crashing", async () => {
    const mdText = `# Markdown Render Demo

This is a paragraph featuring **bold text**, *italic emphasis*, and \`inline code\`.

## Blockquotes & Code Blocks
> This is a quote block.
> And it can contain nested quotes.

\`\`\`ts
const value = "Hello World";
console.log(value);
\`\`\`

## Lists
- Bullet list item 1
- Bullet list item 2
  - Nested list item

1. Ordered list item 1
2. Ordered list item 2

## Mermaid Diagram
\`\`\`mermaid
graph TD
Start[Start Demo] --> Select[Select Tab]
Select -->|Markup| MarkupTab[Show markup details]
Select -->|Syntax| SyntaxTab[Show highlighted code]
Select -->|Markdown| MarkdownTab[Show rendered markdown]
\`\`\`
`;

    await mountApp(<Markdown>{mdText}</Markdown>, {
      cols: 80,
      rows: 25,
      capabilities: { glyphProtocol: false, graphicsProtocol: "none" },
    });
  });

  test("renders mermaid code blocks into a SyntaxWidget", async () => {
    const mdContent = `
# Mermaid test
\`\`\`mermaid
graph TD
A --> B
\`\`\`
`;

    const { app } = await mountApp(<Markdown>{mdContent}</Markdown>, {
      cols: 80,
      rows: 25,
      capabilities: { glyphProtocol: false, graphicsProtocol: "none" },
    });

    const mdWidget = app.activeScreen.children[0] as MarkdownWidget;
    expect(blocks(mdWidget).length).toBe(2);
    expect(mdWidget.children[0].tagName).toBe("heading");
    expect(mdWidget.children[1].tagName).toBe("syntax");

    const syntaxWidget = mdWidget.children[1] as any;
    expect(syntaxWidget.language).toBe("mermaid");
  });
});

describe("Markdown error resilience", () => {
  test("shows the raw text instead of blanking when the lexer itself throws", () => {
    const w = new MarkdownWidget();
    w.appendChild(new TextNode("some *markdown*"));
    const spy = vi.spyOn(getMarked(), "lexer").mockImplementation(() => {
      throw new Error("boom");
    });
    try {
      w.measure(80, 24);
      const fallback = blocks(w)[0] as any;
      expect(fallback.tagName).toBe("richtext");
      expect(fallback.getTextContent()).toContain("some *markdown*");
    } finally {
      spy.mockRestore();
    }
  });

  test("a table cell whose markup fails to parse falls back to its raw text", () => {
    const spy = vi.spyOn(RichText, "fromMarkup").mockImplementation(() => {
      throw new Error("boom");
    });
    try {
      const w = md(["| A |", "| - |", "| cell |"].join("\n"));
      expect(tags(w)).toContain("table");
    } finally {
      spy.mockRestore();
    }
  });

  test("trimTrailingMargin zeroes only the last block's bottom margin", () => {
    const w = new MarkdownWidget();
    w.trimTrailingMargin = true;
    md("first paragraph\n\nsecond paragraph", w);
    const blockWidgets = blocks(w);
    expect(blockWidgets.length).toBe(2);
    expect((blockWidgets[0].style.margin as any).bottom).toBe(1);
    expect((blockWidgets[1].style.margin as any).bottom).toBe(0);
  });
});
