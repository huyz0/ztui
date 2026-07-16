import { describe, expect, test } from "vitest";
import { TextNode } from "../dom/text-node.ts";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { Collapsible, Label } from "../react/components.tsx";
import { reconciler } from "../react/reconciler.ts";
import { ScreenBuffer } from "../render/buffer.ts";
import { CollapsibleWidget } from "../widgets/layout/collapsible.ts";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 40,
  rows: 12,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
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

  test("left key collapses an already-open section", async () => {
    const toggles: boolean[] = [];
    const t = await mountApp(
      <Collapsible id="c" title="Section" defaultOpen onToggle={(o) => toggles.push(o)}>
        <Label>body</Label>
      </Collapsible>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<CollapsibleWidget>("c") as CollapsibleWidget;

    w.handleKey({ name: "left", handled: false } as never);
    await t.settle();
    expect(toggles).toEqual([false]);
  });

  test("handleKey is a no-op once the event is already handled", async () => {
    const toggles: boolean[] = [];
    const t = await mountApp(
      <Collapsible id="c" title="Section" onToggle={(o) => toggles.push(o)}>
        <Label>body</Label>
      </Collapsible>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<CollapsibleWidget>("c") as CollapsibleWidget;

    w.handleKey({ name: "enter", handled: true } as never);
    await t.settle();
    expect(toggles).toEqual([]);
  });

  test("handleKey falls back to ev.key when ev.name is absent", async () => {
    const toggles: boolean[] = [];
    const t = await mountApp(
      <Collapsible id="c" title="Section" onToggle={(o) => toggles.push(o)}>
        <Label>body</Label>
      </Collapsible>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<CollapsibleWidget>("c") as CollapsibleWidget;

    w.handleKey({ key: "enter", handled: false } as never);
    await t.settle();
    expect(toggles).toEqual([true]);
  });

  test("handleMouse is a no-op once the event is already handled", async () => {
    const toggles: boolean[] = [];
    const t = await mountApp(
      <Collapsible id="c" title="Section" onToggle={(o) => toggles.push(o)}>
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
      handled: true,
    } as never);
    await t.settle();
    expect(toggles).toEqual([]);
  });

  test("a click off the title row does not toggle", async () => {
    const toggles: boolean[] = [];
    const t = await mountApp(
      <Collapsible id="c" title="Section" onToggle={(o) => toggles.push(o)}>
        <Label>body</Label>
      </Collapsible>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<CollapsibleWidget>("c") as CollapsibleWidget;
    const contentY = w.getContentRect().y;

    w.handleMouse({
      type: "press",
      button: "left",
      x: w.getContentRect().x,
      y: contentY, // one row below the title row
      handled: false,
    } as never);
    await t.settle();
    expect(toggles).toEqual([]);
  });

  test("render() skips the title row if it would fall outside the widget's region", () => {
    // The title is drawn one row above the content rect (the padding-top row
    // the widget reserves for it). If a caller overrides padding-top to 0,
    // that row sits above the widget's own region entirely, so render() must
    // bail instead of drawing off the top edge.
    const c = new CollapsibleWidget();
    c.title = "Section";
    c.style.padding = { top: 0, right: 0, bottom: 0, left: 0 };
    c.style.border = "none";
    c.region = new Region(new Offset(0, 0), new Size(20, 3));
    const buffer = new ScreenBuffer(20, 3);
    expect(() => c.render(buffer)).not.toThrow();
    const row0 = buffer.cells[0].map((cell) => cell.char).join("");
    expect(row0).not.toContain("Section");
  });

  test("measure() skips non-Widget children (e.g. a TextNode) when toggling visibility", () => {
    // Body content is normally Widget children, but the DOM layer allows any
    // DOMNode (e.g. a literal TextNode from a JSX text child) to be appended;
    // measure()'s visibility toggle must not blow up on those.
    const c = new CollapsibleWidget();
    c.open = true;
    const text = new TextNode("plain text");
    c.appendChild(text);

    expect(() => c.measure(40, 10)).not.toThrow();
  });

  test("non-press-left mouse events are ignored", async () => {
    const toggles: boolean[] = [];
    const t = await mountApp(
      <Collapsible id="c" title="Section" onToggle={(o) => toggles.push(o)}>
        <Label>body</Label>
      </Collapsible>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<CollapsibleWidget>("c") as CollapsibleWidget;
    const titleY = w.getContentRect().y - 1;

    w.handleMouse({
      type: "release",
      button: "left",
      x: w.getContentRect().x,
      y: titleY,
      handled: false,
    } as never);
    await t.settle();
    expect(toggles).toEqual([]);
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
