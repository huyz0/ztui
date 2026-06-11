import { describe, expect, test } from "vitest";
import { Markdown } from "../react/components.tsx";
import { reconciler } from "../react/reconciler.ts";
import type { MarkdownWidget } from "../widgets/text/markdown.ts";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const CAPS = { glyphProtocol: false, graphicsProtocol: "none" } as const;
const OPTS = { cols: 50, rows: 40, capabilities: CAPS };

// Documents that mix committable blocks (heading/paragraph/hr) with ones that
// must never be committed early (lists, fenced code, blockquotes) plus inline
// constructs remend repairs while streaming (**bold**, `code`).
const DOCS = [
  "# Title\n\nFirst paragraph with **bold** text.\n\nSecond paragraph.\n\n---\n\nDone.",
  "Intro line.\n\n- one\n- two\n- three\n\nAfter the list.\n\n## Heading two\n\nTail.",
  "Para.\n\n```js\nconst x = 1;\nconsole.log(x);\n```\n\nClosing paragraph here.",
  "> quoted line\n> more quote\n\nplain paragraph\n\n### h3\n\nlast bit of `inline` text",
];

const md = (t: MountResult): MarkdownWidget => t.screen.children[0] as unknown as MarkdownWidget;
type MountResult = Awaited<ReturnType<typeof mountApp>>;

// Stream `doc` one character at a time through a single Markdown widget,
// capturing the rendered frame at every prefix. One app at a time avoids the
// global App.instance singleton being shared across concurrent mounts.
async function streamFrames(doc: string, disableCache: boolean) {
  const t = await mountApp(<Markdown>{""}</Markdown>, OPTS);
  await t.settle();
  md(t).disableStreamingCache = disableCache;
  const frames: string[] = [];
  for (let n = 1; n <= doc.length; n++) {
    reconciler.updateContainer(<Markdown>{doc.slice(0, n)}</Markdown>, t.container, null, () => {});
    await t.settle();
    frames.push(t.text());
  }
  return { frames, committedLength: md(t).committedLength };
}

describe("Markdown streaming (incremental lex)", () => {
  // The streaming cache only changes which *tokens* feed reconciliation, so an
  // incremental (cache-on) widget must render byte-for-byte the same as one with
  // the cache disabled, driven through the identical prefix sequence. Holding the
  // widget-reuse path constant isolates the optimization from unrelated reuse
  // behavior.
  for (const [d, doc] of DOCS.entries()) {
    test(`cache-on matches cache-off at every prefix (doc ${d})`, async () => {
      const on = await streamFrames(doc, false);
      const off = await streamFrames(doc, true);
      expect(on.frames).toEqual(off.frames);
      expect(off.committedLength).toBe(0); // cache disabled never commits
    });
  }

  // Stronger than cache-on vs cache-off: prove the *reused* widget tree (built
  // up by streaming) renders identically to a fresh parse of the same text.
  // Capture every incremental frame while only one app is alive, THEN do the
  // fresh mounts — the global `App.instance` singleton means a second live app
  // would resolve the first's styles, so the two phases must not overlap.
  test("single-app incremental render matches a fresh parse at sampled prefixes", async () => {
    const doc = DOCS[0];
    // One app streams the whole doc in place (cheap); capture frames at a few
    // prefixes that straddle block boundaries. Fresh mounts (one app at a time)
    // are limited to those samples so the shared reconciler isn't stressed.
    const samples = [3, 10, 20, 40, 55, doc.length].filter((n) => n <= doc.length);
    const t = await mountApp(<Markdown>{""}</Markdown>, OPTS);
    await t.settle();
    const incremental = new Map<number, string>();
    for (let n = 1; n <= doc.length; n++) {
      reconciler.updateContainer(
        <Markdown>{doc.slice(0, n)}</Markdown>,
        t.container,
        null,
        () => {},
      );
      await t.settle();
      if (samples.includes(n)) incremental.set(n, t.text());
    }
    for (const n of samples) {
      const fresh = await mountApp(<Markdown>{doc.slice(0, n)}</Markdown>, OPTS);
      await fresh.settle();
      expect(fresh.text(), `prefix len ${n}`).toBe(incremental.get(n));
    }
  });

  test("the streaming cache engages on documents with closed leading blocks", async () => {
    // docs 0-2 start with a paragraph/heading (committable); doc 3 leads with a
    // blockquote (never committable), so its prefix can't commit.
    expect((await streamFrames(DOCS[0], false)).committedLength).toBeGreaterThan(0);
    expect((await streamFrames(DOCS[3], false)).committedLength).toBe(0);
  });

  test("commits stable leading blocks but never the streaming tail", async () => {
    const doc = "# Title\n\nA paragraph.\n\nAnother paragraph still being typed";
    const t = await mountApp(<Markdown>{""}</Markdown>, OPTS);
    await t.settle();
    reconciler.updateContainer(<Markdown>{doc}</Markdown>, t.container, null, () => {});
    await t.settle();

    const committed = doc.slice(0, md(t).committedLength);
    expect(committed).toContain("# Title");
    expect(committed).toContain("A paragraph.");
    expect(committed).not.toContain("still being typed");
  });

  test("never commits an unterminated list", async () => {
    const t = await mountApp(<Markdown>{""}</Markdown>, OPTS);
    await t.settle();
    reconciler.updateContainer(<Markdown>{"- a\n- b\n"}</Markdown>, t.container, null, () => {});
    await t.settle();
    // Lists are excluded from the committable set, so nothing commits.
    expect(md(t).committedLength).toBe(0);
  });
});
