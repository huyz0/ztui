import { describe, expect, test } from "vitest";
import "../../markdown.ts"; // registers the block widgets MarkdownWidget builds
import { TextNode } from "../../dom/text-node.ts";
import { Markdown } from "../../render/rich/markdown.ts";
import { perfGuard, SAMPLE_MARKDOWN } from "../../test/bench/perf-harness.ts";
import { MarkdownWidget } from "./markdown.ts";

// Markdown is parsed and turned into a widget subtree on every content change —
// and re-parsed token-by-token while an LLM response streams in, so both a
// cold build and an incremental append are hot.
describe("perf: Markdown (parse + build)", () => {
  test("renderToLines parses a document to styled lines", () => {
    perfGuard("markdown.renderToLines", () => Markdown.renderToLines(SAMPLE_MARKDOWN), {
      iterations: 200,
      budget: 80,
    });
  });

  test("MarkdownWidget builds the full block subtree from source", () => {
    const w = new MarkdownWidget();
    w.appendChild(new TextNode(SAMPLE_MARKDOWN));
    w.measure(80, 40);
    // Invariant: a non-trivial document produces a non-trivial subtree.
    expect(w.children.length).toBeGreaterThan(3);
    perfGuard(
      "markdown.MarkdownWidget build (cold)",
      () => {
        const fresh = new MarkdownWidget();
        fresh.appendChild(new TextNode(SAMPLE_MARKDOWN));
        fresh.measure(80, 40);
      },
      { iterations: 100, budget: 260 },
    );
  });

  test("MarkdownWidget reconciles a streaming append", () => {
    // Simulate the streaming case: a stable prefix with one more word each frame.
    const w = new MarkdownWidget();
    const node = new TextNode("");
    w.appendChild(node);
    const words = SAMPLE_MARKDOWN.split(" ");
    let n = 1;
    perfGuard(
      "markdown.MarkdownWidget reconcile (stream)",
      () => {
        n = (n % words.length) + 1;
        node.text = words.slice(0, n).join(" ");
        w.measure(80, 40);
      },
      { iterations: 300, budget: 110 },
    );
  });
});
