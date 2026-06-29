import { describe, expect, test } from "vitest";
import type { Widget } from "../dom/widget.ts";
import { Button, DevTools, DevToolsHighlight, Input, Label, VBox } from "../react/components.tsx";
import { findDevId, resolveDevNode, serializeDevTree, widgetDetail } from "../tools/devtools.ts";
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

  test("findDevId is the inverse of resolveDevNode (widget → id)", async () => {
    const t = await mountApp(
      <VBox id="root">
        <Label>Hi</Label>
        <Button id="go">Go</Button>
      </VBox>,
      OPTS,
    );
    await t.settle();
    const root = t.findById<Widget>("root") as Widget;
    const go = t.findById<Widget>("go") as Widget;
    const id = findDevId(root, go);
    expect(id).toBe("0/1");
    expect(resolveDevNode(root, id as string)).toBe(go);
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

  test("DevToolsHighlight draws a heavy border box at the region", async () => {
    const t = await mountApp(
      <VBox style={{ width: "100%", height: "100%" }}>
        <DevToolsHighlight region={{ x: 2, y: 1, width: 6, height: 3 }} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    expect(t.cellAt(2, 1).char).toBe("┏"); // top-left corner
    expect(t.cellAt(7, 1).char).toBe("┓"); // top-right (x = 2 + 6 - 1)
    expect(t.cellAt(2, 3).char).toBe("┗"); // bottom-left (y = 1 + 3 - 1)
    expect(t.cellAt(7, 3).char).toBe("┛");
    expect(t.cellAt(3, 1).char).toBe("━"); // top edge
    expect(t.cellAt(2, 2).char).toBe("┃"); // left edge
  });

  test("null region renders nothing", async () => {
    const t = await mountApp(
      <VBox style={{ width: "100%", height: "100%" }}>
        <DevToolsHighlight region={null} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    expect(t.cellAt(2, 1).char).toBe(" ");
  });
});
