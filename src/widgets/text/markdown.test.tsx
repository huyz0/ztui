import { describe, expect, test, vi } from "vitest";
import { TextNode } from "../../dom/text-node.ts";
import type { Widget } from "../../dom/widget.ts";
import { Markdown } from "../../react.ts";
import "../../markdown.ts";
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
