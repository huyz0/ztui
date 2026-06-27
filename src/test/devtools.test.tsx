import { describe, expect, test } from "vitest";
import type { Widget } from "../dom/widget.ts";
import { Button, DevTools, Input, Label, VBox } from "../react/components.tsx";
import { resolveDevNode, serializeDevTree, widgetDetail } from "../tools/devtools.ts";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = { cols: 60, rows: 16 };

describe("devtools data layer", () => {
  test("serializes the widget tree (skipping text nodes) with path ids", async () => {
    const t = await mountApp(
      <VBox id="root">
        <Label>Hi</Label>
        <Button id="go">Go</Button>
      </VBox>,
      OPTS,
    );
    await t.settle();
    const root = t.findById<Widget>("root") as Widget;
    const tree = serializeDevTree(root);
    expect(tree.label).toContain("box"); // VBox → host tag "box"
    expect(tree.label).toContain("#root");
    expect(tree.children.map((c) => c.tagName)).toEqual(["label", "button"]);
    // Text under the label is not its own tree node.
    expect(tree.children[0].children).toEqual([]);
    expect(tree.children[1].id).toBe(`${tree.id}/1`);
  });

  test("resolveDevNode round-trips an id back to the live widget", async () => {
    const t = await mountApp(
      <VBox id="root">
        <Label>Hi</Label>
        <Button id="go">Go</Button>
      </VBox>,
      OPTS,
    );
    await t.settle();
    const root = t.findById<Widget>("root") as Widget;
    const tree = serializeDevTree(root);
    const resolved = resolveDevNode(root, tree.children[1].id);
    expect(resolved).toBe(t.findById<Widget>("go"));
  });

  test("widgetDetail reports identity, geometry and flags", async () => {
    const t = await mountApp(
      <VBox id="root">
        <Button id="go">Go</Button>
      </VBox>,
      OPTS,
    );
    await t.settle();
    const go = t.findById<Widget>("go") as Widget;
    const rows = widgetDetail(go);
    const byTerm = Object.fromEntries(rows.map((r) => [r.term, r.description]));
    expect(byTerm.tag).toBe("button");
    expect(byTerm.id).toBe("go");
    expect(byTerm.region).toMatch(/\d+×\d+/);
    expect(byTerm.state).toContain("focusable");
  });
});

describe("DevTools panel", () => {
  test("renders the inspected tree and a profiler strip", async () => {
    let rootRef: Widget | null = null;
    const t = await mountApp(
      <VBox style={{ width: "100%", height: "100%" }}>
        <VBox
          id="inspected"
          ref={(w: Widget | null) => {
            rootRef = w;
          }}
        >
          <Button id="alpha">Alpha</Button>
          <Input id="beta" />
        </VBox>
      </VBox>,
      OPTS,
    );
    await t.settle();
    expect(rootRef).toBeTruthy();

    // Mount the panel pointed at the inspected root.
    const p = await mountApp(
      <DevTools
        root={rootRef}
        frame={{ full: false, widgetsRendered: 3, bytes: 128, reasons: ["key:widget-handled"] }}
      />,
      OPTS,
    );
    await p.settle();
    const text = p.text();
    expect(text).toContain("DevTools");
    expect(text).toContain("button");
    expect(text).toContain("scoped"); // profiler strip
  });
});
