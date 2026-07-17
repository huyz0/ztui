import { describe, expect, test } from "vitest";
import type { Widget } from "../dom/widget.ts";
import {
  accentStyle,
  ChatBubble,
  DEFAULT_ROLE_ACCENTS,
  Label,
  resolveAccent,
} from "../react/components.tsx";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 50,
  rows: 10,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
};

describe("ChatBubble", () => {
  test("renders the author header, icon and body", async () => {
    const t = await mountApp(
      <ChatBubble role="tool" author="Bash" icon={<Label>{">"}</Label>}>
        <Label>tool output here</Label>
      </ChatBubble>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("Bash");
    expect(text).toContain(">");
    expect(text).toContain("tool output here");
  });

  test("omitting author and icon hides the header row", async () => {
    const t = await mountApp(
      <ChatBubble role="assistant">
        <Label>just the body</Label>
      </ChatBubble>,
      OPTS,
    );
    await t.settle();
    const lines = t
      .text()
      .split("\n")
      .filter((l) => l.trim().length > 0);
    // First non-blank line is the body itself — no header above it.
    expect(lines[0]).toContain("just the body");
  });

  test("the user role paints a right-edge bar; assistant a left-edge bar", async () => {
    const u = await mountApp(
      <ChatBubble id="b" role="user" author="You">
        <Label>hi</Label>
      </ChatBubble>,
      OPTS,
    );
    await u.settle();
    const ub = (u.findById<Widget>("b") as Widget).computedStyle;
    expect(ub.borderRight).toBeTruthy();
    expect(ub.borderLeft).toBeFalsy();

    const a = await mountApp(
      <ChatBubble id="b" role="assistant" author="Claude">
        <Label>hi</Label>
      </ChatBubble>,
      OPTS,
    );
    await a.settle();
    const ab = (a.findById<Widget>("b") as Widget).computedStyle;
    expect(ab.borderLeft).toBeTruthy();
    expect(ab.borderRight).toBeFalsy();
  });

  test("background={null} suppresses the role's default tint", async () => {
    const t = await mountApp(
      <ChatBubble id="b" role="assistant" background={null}>
        <Label>hi</Label>
      </ChatBubble>,
      OPTS,
    );
    await t.settle();
    const cs = (t.findById<Widget>("b") as Widget).computedStyle;
    expect(cs.background).toBeFalsy();
  });

  test("an explicit background overrides the role's default tint", async () => {
    const t = await mountApp(
      <ChatBubble id="b" role="assistant" background="#123456">
        <Label>hi</Label>
      </ChatBubble>,
      OPTS,
    );
    await t.settle();
    const cs = (t.findById<Widget>("b") as Widget).computedStyle;
    expect(cs.background).toBe("#123456");
  });

  test("an icon with no author still renders the header row (icon only)", async () => {
    const t = await mountApp(
      <ChatBubble icon={<Label>{">"}</Label>}>
        <Label>body</Label>
      </ChatBubble>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain(">");
    expect(text).toContain("body");
  });

  test("accent override replaces only the named facet", async () => {
    const t = await mountApp(
      <ChatBubble id="b" role="user" accent={{ side: "left" }} author="You">
        <Label>hi</Label>
      </ChatBubble>,
      OPTS,
    );
    await t.settle();
    const cs = (t.findById<Widget>("b") as Widget).computedStyle;
    // Side flipped to left, but the user weight (heavy) is kept.
    expect(cs.borderLeft).toBe(DEFAULT_ROLE_ACCENTS.user.weight);
    expect(cs.borderRight).toBeFalsy();
  });

  test('align="full" (the default) renders no wrapper — the bubble itself spans 100%', async () => {
    const t = await mountApp(
      <ChatBubble id="b" role="assistant">
        <Label>hi</Label>
      </ChatBubble>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<Widget>("b") as Widget;
    expect(w.computedStyle.width).toBeUndefined(); // no width cap applied
    // No extra flex-spacer sibling — parent is the mounted root, not an HBox wrapper.
    expect(w.parent?.children.length).toBe(1);
  });

  test('align="right" caps the bubble width and pushes it past a trailing spacer', async () => {
    const t = await mountApp(
      <ChatBubble id="b" role="user" align="right">
        <Label>hi</Label>
      </ChatBubble>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<Widget>("b") as Widget;
    expect(w.computedStyle.width).toBe("75%");
    // Wrapped in an HBox: [spacer, bubble] — the spacer comes first.
    const siblings = w.parent?.children ?? [];
    expect(siblings.length).toBe(2);
    expect(siblings[0]).not.toBe(w);
    expect(siblings[1]).toBe(w);
  });

  test('align="left" caps the bubble width and pushes it before a trailing spacer', async () => {
    const t = await mountApp(
      <ChatBubble id="b" role="assistant" align="left">
        <Label>hi</Label>
      </ChatBubble>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<Widget>("b") as Widget;
    expect(w.computedStyle.width).toBe("75%");
    const siblings = w.parent?.children ?? [];
    expect(siblings.length).toBe(2);
    expect(siblings[0]).toBe(w);
    expect(siblings[1]).not.toBe(w);
  });

  test("bubbleWidth overrides the default 75% cap", async () => {
    const t = await mountApp(
      <ChatBubble id="b" role="user" align="right" bubbleWidth="50%">
        <Label>hi</Label>
      </ChatBubble>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<Widget>("b") as Widget;
    expect(w.computedStyle.width).toBe("50%");
  });

  test("align has no effect on the accent bar side — that's still governed by role/accent", async () => {
    const t = await mountApp(
      <ChatBubble id="b" role="user" align="left">
        <Label>hi</Label>
      </ChatBubble>,
      OPTS,
    );
    await t.settle();
    const cs = (t.findById<Widget>("b") as Widget).computedStyle;
    expect(cs.borderRight).toBeTruthy(); // user's default side, unchanged by align
    expect(cs.borderLeft).toBeFalsy();
  });
});

describe("roles helpers", () => {
  test("resolveAccent merges role preset with overrides", () => {
    expect(resolveAccent("user")).toEqual(DEFAULT_ROLE_ACCENTS.user);
    expect(resolveAccent("user", { color: "#abc" })).toEqual({
      ...DEFAULT_ROLE_ACCENTS.user,
      color: "#abc",
    });
    expect(resolveAccent()).toEqual(DEFAULT_ROLE_ACCENTS.assistant);
  });

  test("accentStyle paints only the chosen edge", () => {
    expect(accentStyle({ color: "$accent", side: "left", weight: "thin" })).toEqual({
      borderLeft: "thin",
      borderColor: "$accent",
    });
    expect(accentStyle({ color: "$warning", side: "right", weight: "bar" })).toEqual({
      borderRight: "bar",
      borderColor: "$warning",
    });
  });
});
