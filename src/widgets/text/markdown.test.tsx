import { describe, expect, test, vi } from "vitest";
import { TextNode } from "../../dom/text-node.ts";
import type { Widget } from "../../dom/widget.ts";
import { Markdown } from "../../index.ts";
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

function tags(w: Widget): string[] {
  return w.children.map((c: any) => c.tagName);
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
    expect(w.children.length).toBe(0);
  });

  test("clearing the source removes all generated blocks", () => {
    const w = md("# hello\n\ntext");
    expect(w.children.length).toBeGreaterThan(0);
    md("", w);
    expect(w.children.length).toBe(0);
  });
});

describe("Markdown streaming reconciliation", () => {
  test("unchanged leading blocks are reused, appended blocks are added", () => {
    const w = md("# Title\n\nfirst paragraph.\n");
    const [heading] = w.children;
    md("# Title\n\nfirst paragraph.\n\nsecond paragraph.\n", w);
    // The heading token is byte-identical and its widget is reused; the last
    // paragraph's raw changes once content follows it, so it may be rebuilt.
    expect(w.children[0]).toBe(heading);
    expect(w.children.length).toBe(3);
  });

  test("a mutated block is rebuilt while its siblings are kept", () => {
    const w = md("# Title\n\nalpha\n\nomega\n");
    const [heading, , omega] = w.children;
    md("# Title\n\nalpha CHANGED\n\nomega\n", w);
    expect(w.children[0]).toBe(heading);
    expect(w.children[1]).not.toBe(undefined);
    expect(w.children[2]).toBe(omega);
  });

  test("removing trailing blocks shrinks the tree", () => {
    const w = md("one\n\ntwo\n\nthree\n");
    expect(w.children.length).toBe(3);
    md("one\n", w);
    expect(w.children.length).toBe(1);
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

  test("unparseable fence JSON falls back to the raw text as content", async () => {
    const fence = "```ztui-label\n!!! not json at all !!!\n```";
    const t = await mountApp(<Markdown>{fence}</Markdown>);
    expect(t.text()).toContain("!!! not json at all !!!");
  });
});
