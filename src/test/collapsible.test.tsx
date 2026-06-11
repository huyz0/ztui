import { describe, expect, test } from "vitest";
import { Collapsible, Label } from "../react/components.tsx";
import { reconciler } from "../react/reconciler.ts";
import type { CollapsibleWidget } from "../widgets/layout/collapsible.ts";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 40,
  rows: 12,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" },
};

describe("Collapsible", () => {
  test("shows the title with a disclosure triangle; body hidden when collapsed", async () => {
    const t = await mountApp(
      <Collapsible id="c" title="Tool call">
        <Label>secret body</Label>
      </Collapsible>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("▸"); // collapsed marker
    expect(text).toContain("Tool call");
    expect(text).not.toContain("secret body");
  });

  test("expands when defaultOpen, revealing the body with the open marker", async () => {
    const t = await mountApp(
      <Collapsible title="Tool call" defaultOpen>
        <Label>secret body</Label>
      </Collapsible>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("▾"); // open marker
    expect(text).toContain("secret body");
  });

  test("Enter toggles open/closed and fires onToggle with the next state", async () => {
    const toggles: boolean[] = [];
    const t = await mountApp(
      <Collapsible id="c" title="Section" onToggle={(o) => toggles.push(o)}>
        <Label>body text</Label>
      </Collapsible>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<CollapsibleWidget>("c") as CollapsibleWidget;

    w.handleKey({ name: "enter", handled: false } as never);
    await t.settle();
    expect(toggles).toEqual([true]);
    expect(t.text()).toContain("body text");

    w.handleKey({ name: "enter", handled: false } as never);
    await t.settle();
    expect(toggles).toEqual([true, false]);
    expect(t.text()).not.toContain("body text");
  });

  test("arrow keys expand/collapse directionally", async () => {
    const toggles: boolean[] = [];
    const t = await mountApp(
      <Collapsible id="c" title="Section" onToggle={(o) => toggles.push(o)}>
        <Label>body</Label>
      </Collapsible>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<CollapsibleWidget>("c") as CollapsibleWidget;

    // Left when already collapsed: no-op. Right expands. Right again: no-op.
    w.handleKey({ name: "left", handled: false } as never);
    w.handleKey({ name: "right", handled: false } as never);
    await t.settle();
    expect(toggles).toEqual([true]);
  });

  test("controlled open prop drives visibility; toggling does not self-open", async () => {
    const toggles: boolean[] = [];
    const t = await mountApp(
      <Collapsible id="c" title="Section" open={false} onToggle={(o) => toggles.push(o)}>
        <Label>body</Label>
      </Collapsible>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<CollapsibleWidget>("c") as CollapsibleWidget;

    // Controlled + parent ignores onToggle → stays closed even after Enter.
    w.handleKey({ name: "enter", handled: false } as never);
    await t.settle();
    expect(toggles).toEqual([true]);
    expect(t.text()).not.toContain("body");

    // Parent flips the prop → now open.
    reconciler.updateContainer(
      <Collapsible id="c" title="Section" open={true} onToggle={(o) => toggles.push(o)}>
        <Label>body</Label>
      </Collapsible>,
      t.container,
      null,
      () => {},
    );
    await t.settle();
    expect(t.text()).toContain("body");
  });

  test("clicking the title row toggles", async () => {
    const t = await mountApp(
      <Collapsible id="c" title="Section">
        <Label>body</Label>
      </Collapsible>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<CollapsibleWidget>("c") as CollapsibleWidget;
    const titleY = w.getContentRect().y - 1;

    w.handleMouse({
      type: "press",
      button: "left",
      x: w.getContentRect().x,
      y: titleY,
      handled: false,
    } as never);
    await t.settle();
    expect(t.text()).toContain("body");
  });
});
