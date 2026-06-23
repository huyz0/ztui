import { describe, expect, test } from "vitest";
import type { Widget } from "../dom/widget.ts";
import { Label, Transcript } from "../react/components.tsx";
import { reconciler } from "../react/reconciler.ts";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 30,
  rows: 24,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
};

// More lines than the viewport holds, so the content actually overflows.
const lines = (n: number) =>
  Array.from({ length: n }, (_, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: static ordered fixture
    <Label key={i}>line{i}</Label>
  ));

describe("Transcript", () => {
  test("tails: the newest content is visible, the oldest is scrolled off", async () => {
    const t = await mountApp(<Transcript>{lines(40)}</Transcript>, OPTS);
    await t.settle();
    await t.settle();
    const text = t.text();
    expect(text).toContain("line39"); // newest pinned into view
    expect(text).not.toContain("line0"); // oldest scrolled away
  });

  test("stays pinned as new turns arrive", async () => {
    const t = await mountApp(<Transcript id="tx">{lines(40)}</Transcript>, OPTS);
    await t.settle();
    await t.settle();
    reconciler.updateContainer(
      <Transcript id="tx">{lines(50)}</Transcript>,
      t.container,
      null,
      () => {},
    );
    await t.settle();
    await t.settle();
    expect(t.text()).toContain("line49"); // jumped to the new bottom
  });

  test("followTail={false} starts at the top and does not jump", async () => {
    const t = await mountApp(<Transcript followTail={false}>{lines(40)}</Transcript>, OPTS);
    await t.settle();
    const text = t.text();
    expect(text).toContain("line0"); // top of history
    expect(text).not.toContain("line39");
  });

  test("scrolling up detaches the tail; new content no longer jumps to bottom", async () => {
    const t = await mountApp(<Transcript id="tx">{lines(40)}</Transcript>, OPTS);
    await t.settle();
    await t.settle();
    const w = t.findById<Widget>("tx") as Widget;

    // Scroll up — detaches tail-following.
    for (let i = 0; i < 8; i++) {
      w.handleScroll({ type: "scroll_up", x: 1, y: 1, handled: false } as never);
    }
    await t.settle();
    reconciler.updateContainer(
      <Transcript id="tx">{lines(50)}</Transcript>,
      t.container,
      null,
      () => {},
    );
    await t.settle();
    // Detached: the very newest line is not force-shown.
    expect(t.text()).not.toContain("line49");
  });
});
