import { describe, expect, test } from "vitest";
import type { Widget } from "../dom/widget.ts";
import type { Spacing } from "../geometry/spacing.ts";
import { ChatBubble, Label, Transcript } from "../react/components.tsx";
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

  describe("role-switch spacing between ChatBubbles", () => {
    test("consecutive same-role bubbles get no gap", async () => {
      const t = await mountApp(
        <Transcript>
          <ChatBubble id="b1" role="user">
            one
          </ChatBubble>
          <ChatBubble id="b2" role="user">
            two
          </ChatBubble>
        </Transcript>,
        OPTS,
      );
      await t.settle();
      const b2 = t.findById<Widget>("b2") as Widget;
      expect(b2.computedStyle.margin).toBeFalsy();
    });

    test("a role switch inserts a blank line above the new bubble", async () => {
      const t = await mountApp(
        <Transcript>
          <ChatBubble id="b1" role="user">
            one
          </ChatBubble>
          <ChatBubble id="b2" role="assistant">
            two
          </ChatBubble>
        </Transcript>,
        OPTS,
      );
      await t.settle();
      const b1 = t.findById<Widget>("b1") as Widget;
      const b2 = t.findById<Widget>("b2") as Widget;
      expect(b1.computedStyle.margin).toBeFalsy(); // first bubble: no gap before it
      expect((b2.computedStyle.margin as Spacing)?.top).toBe(1);
    });

    test("the very first bubble never gets a gap, even with no prior sibling", async () => {
      const t = await mountApp(
        <Transcript>
          <ChatBubble id="b1" role="assistant">
            hi
          </ChatBubble>
        </Transcript>,
        OPTS,
      );
      await t.settle();
      const b1 = t.findById<Widget>("b1") as Widget;
      expect(b1.computedStyle.margin).toBeFalsy();
    });

    test("a non-ChatBubble sibling (e.g. a tool render) resets the run — the next bubble always gets a gap", async () => {
      const t = await mountApp(
        <Transcript>
          <ChatBubble id="b1" role="user">
            one
          </ChatBubble>
          <Label id="tool">tool output</Label>
          <ChatBubble id="b2" role="user">
            two
          </ChatBubble>
        </Transcript>,
        OPTS,
      );
      await t.settle();
      const b2 = t.findById<Widget>("b2") as Widget;
      expect((b2.computedStyle.margin as Spacing)?.top).toBe(1); // same role as b1, but the Label broke the run
    });

    test("an explicit margin on the bubble wins over the computed gap", async () => {
      const t = await mountApp(
        <Transcript>
          <ChatBubble id="b1" role="user">
            one
          </ChatBubble>
          <ChatBubble id="b2" role="assistant" style={{ margin: { top: 3 } }}>
            two
          </ChatBubble>
        </Transcript>,
        OPTS,
      );
      await t.settle();
      const b2 = t.findById<Widget>("b2") as Widget;
      expect((b2.computedStyle.margin as Spacing)?.top).toBe(3);
    });
  });
});
