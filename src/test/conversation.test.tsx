import { describe, expect, test } from "vitest";
import type { App } from "../core/app.ts";
import type { DOMNode } from "../dom/dom.ts";
import { ChatBubble, Conversation } from "../react/components.tsx";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 50,
  rows: 16,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
};

/** Whether a widget with the given tag is mounted anywhere in the tree. */
function hasTag(app: App, tag: string): boolean {
  let found = false;
  const visit = (n: DOMNode) => {
    if ((n as { tagName?: string }).tagName === tag) found = true;
    for (const c of n.children) visit(c);
  };
  visit(app.activeScreen);
  return found;
}

describe("Conversation", () => {
  test("lays out the turns above a docked composer", async () => {
    const t = await mountApp(
      <Conversation placeholder="Message…" onSubmit={() => {}}>
        <ChatBubble role="user">Hello there</ChatBubble>
        <ChatBubble role="assistant">Hi — how can I help?</ChatBubble>
      </Conversation>,
      OPTS,
    );
    await t.settle();
    expect(t.text()).toContain("Hello there");
    expect(t.text()).toContain("Hi — how can I help?");
    // The composer (ChatInput) is mounted.
    expect(hasTag(t.app, "chat-input")).toBe(true);
  });

  test("readOnly hides the composer", async () => {
    const t = await mountApp(
      <Conversation readOnly>
        <ChatBubble role="assistant">archived turn</ChatBubble>
      </Conversation>,
      OPTS,
    );
    await t.settle();
    expect(t.text()).toContain("archived turn");
    expect(hasTag(t.app, "chat-input")).toBe(false);
  });

  test("forwards submitted turns to onSubmit", async () => {
    let sent: string | undefined;
    const t = await mountApp(
      <Conversation
        onSubmit={(v) => {
          sent = v;
        }}
      >
        <ChatBubble role="assistant">ready</ChatBubble>
      </Conversation>,
      OPTS,
    );
    await t.settle();
    // Drive the composer widget directly: set the draft, then submit.
    let widget: any;
    const visit = (n: DOMNode) => {
      if ((n as { tagName?: string }).tagName === "chat-input") widget = n;
      for (const c of n.children) visit(c);
    };
    visit(t.app.activeScreen);
    expect(widget).toBeTruthy();
    widget.value = "hi agent";
    widget.submit();
    await t.settle();
    expect(sent).toBe("hi agent");
  });
});
