import { describe, expect, test } from "vitest";
import { DOMNode } from "../dom/dom.ts";
import type { Widget } from "../dom/widget.ts";
import { Button, DevTools, DevToolsHighlight, Input, Label, VBox } from "../react/components.tsx";
import { reconciler } from "../react/reconciler.ts";
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

  test("widgetDetail reports focused/disabled/hidden flags, truncated text, and computed style rows", async () => {
    const longText = "x".repeat(50);
    const t = await mountApp(
      <VBox id="root">
        <Button id="disabled-btn" disabled visible={false}>
          {longText}
        </Button>
        <Input id="focus-me" style={{ color: "red", background: "blue" }} />
      </VBox>,
      OPTS,
    );
    await t.settle();

    const disabledBtn = t.findById<Widget>("disabled-btn") as Widget;
    const disabledRows = widgetDetail(disabledBtn);
    const disabledByTerm = Object.fromEntries(disabledRows.map((r) => [r.term, r.description]));
    expect(disabledByTerm.state).toContain("disabled");
    expect(disabledByTerm.state).toContain("hidden");
    expect(disabledByTerm.text).toBe(`${longText.slice(0, 39)}…`);

    const focusMe = t.findById<Widget>("focus-me") as Widget;
    t.screen.focusWidget(focusMe);
    const focusedRows = widgetDetail(focusMe);
    const focusedByTerm = Object.fromEntries(focusedRows.map((r) => [r.term, r.description]));
    expect(focusedByTerm.state).toContain("focused");
    expect(focusedByTerm.color).toBe("red");
    expect(focusedByTerm.background).toBe("blue");
  });

  test("edge cases: null node, id-less/class-less nodes, non-Widget nodes, and bad resolveDevNode ids", async () => {
    const t = await mountApp(
      <VBox>
        <Label>plain</Label>
      </VBox>,
      OPTS,
    );
    await t.settle();

    // widgetDetail(null) → no rows.
    expect(widgetDetail(null)).toEqual([]);

    const root = t.findById<Widget>("root") ?? (t.screen as unknown as Widget);
    // The VBox above has no id/classes — its label omits both, and its
    // widgetDetail has no "id"/"classes" rows and no "state" flags (it's not
    // focusable, focused, disabled, or hidden).
    const label = t.findById<Widget>("nonexistent");
    expect(label).toBeUndefined();

    const tree = serializeDevTree(root);
    expect(tree.label).not.toContain("#");
    const boxNode = (() => {
      let found: Widget | undefined;
      t.screen.walk((n) => {
        if ((n as Widget).tagName === "box") found = n as Widget;
      });
      return found;
    })();
    expect(boxNode).toBeTruthy();
    const rows = widgetDetail(boxNode ?? null);
    const byTerm = Object.fromEntries(rows.map((r) => [r.term, r.description]));
    expect(byTerm.id).toBeUndefined();
    expect(byTerm.classes).toBeUndefined();
    expect(byTerm.state).toBeUndefined();

    // resolveDevNode with an out-of-range / non-numeric path segment → null.
    expect(resolveDevNode(root, "0/not-a-number")).toBeNull();
    expect(resolveDevNode(root, "0/999")).toBeNull();

    // widgetDetail on a plain (non-Widget) DOMNode: no region/measured/state
    // rows, and an empty own-text run (a text child whose `.text` is falsy)
    // contributes nothing.
    const plain = new DOMNode("group");
    const emptyText = new DOMNode("text");
    (emptyText as unknown as { text: string }).text = "";
    plain.children.push(emptyText);
    const plainRows = widgetDetail(plain);
    const plainByTerm = Object.fromEntries(plainRows.map((r) => [r.term, r.description]));
    expect(plainByTerm.tag).toBe("group");
    expect(plainByTerm.text).toBeUndefined();
    expect(plainByTerm.region).toBeUndefined();

    // A node with no tagName at all falls back to "?".
    const untagged = new DOMNode();
    expect(widgetDetail(untagged)[0]).toEqual({ term: "tag", description: "?" });
  });

  test("widgetDetail and the label report a widget's classes", async () => {
    const t = await mountApp(
      <VBox id="root">
        <Button id="go" className="primary big">
          Go
        </Button>
      </VBox>,
      OPTS,
    );
    await t.settle();
    const root = t.findById<Widget>("root") as Widget;
    const go = t.findById<Widget>("go") as Widget;
    const tree = serializeDevTree(root);
    expect(tree.children[0].label).toContain(".primary.big");
    const rows = widgetDetail(go);
    const byTerm = Object.fromEntries(rows.map((r) => [r.term, r.description]));
    expect(byTerm.classes).toBe("primary big");
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

  test("DevToolsHighlight tints the target cells (no destructive border)", async () => {
    const t = await mountApp(
      <VBox style={{ width: "100%", height: "100%" }}>
        <Label>abcdefgh</Label>
        <DevToolsHighlight region={{ x: 2, y: 0, width: 4, height: 1 }} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    // Cells inside the target keep their glyph but gain the accent background.
    const inside = t.cellAt(2, 0);
    expect(inside.char).toBe("c"); // glyph preserved (not overwritten by a border)
    expect(inside.style.background).toBeTruthy();
    expect(inside.style.background).not.toBe("default");
    // A cell outside the target keeps its glyph and is not tinted.
    expect(t.cellAt(6, 0).char).toBe("g");
    expect(t.cellAt(6, 0).style.background).not.toBe(inside.style.background);
  });

  test("the tree panel re-serializes the live tree on every poll tick, not only on a selection change", async () => {
    // Regression: the `tree` useMemo depended on [root, selected] but never on
    // the poll's own tick counter, even though the surrounding comment said it
    // should re-read the mutable tree every tick. A live-tree mutation (e.g. a
    // widget's id changing after a re-render) between polls never showed up
    // in the rendered tree panel until `selected` itself happened to change.
    let rootRef: Widget | null = null;
    let alphaRef: Widget | null = null;
    const t = await mountApp(
      <VBox style={{ width: "100%", height: "100%" }}>
        <VBox
          id="inspected"
          ref={(w: Widget | null) => {
            rootRef = w;
          }}
        >
          <Button
            id="alpha"
            ref={(w: Widget | null) => {
              alphaRef = w;
            }}
          >
            Alpha
          </Button>
        </VBox>
        <DevTools root={rootRef} refreshMs={10} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    reconciler.updateContainer(
      <VBox style={{ width: "100%", height: "100%" }}>
        <VBox
          id="inspected"
          ref={(w: Widget | null) => {
            rootRef = w;
          }}
        >
          <Button
            id="alpha"
            ref={(w: Widget | null) => {
              alphaRef = w;
            }}
          >
            Alpha
          </Button>
        </VBox>
        <DevTools root={rootRef} refreshMs={10} />
      </VBox>,
      t.container,
      null,
      () => {},
    );
    await t.settle();
    expect(t.text()).toContain("#alpha");
    expect(t.text()).not.toContain("#renamed");

    // Mutate the live widget directly, bypassing React state entirely.
    (alphaRef as unknown as Widget).id = "renamed";
    await t.settle(30); // let at least one 10ms poll tick fire
    expect(t.text()).toContain("#renamed");
  });

  test("onInspect re-reports the selected widget's region on every poll, not only when the selection changes", async () => {
    // Regression: the polling effect only re-derived the highlighted region
    // when the hovered widget's *id* changed. If the same widget stayed
    // selected/hovered across a resize (e.g. right after a layout pass moved
    // or resized it), the highlight overlay kept painting at the stale rect
    // from the moment it was first selected, until the user picked a
    // different widget.
    let rootRef: Widget | null = null;
    const reports: unknown[] = [];
    // `shifted` moves the hovered button via a real style/layout change
    // (the parent's padding), rather than poking `.region` directly, so the
    // region change survives the app's own re-layout — same widget instance
    // (same id, same key), just repositioned, mirroring a real resize.
    const tree = (shifted: boolean) => (
      <VBox style={{ width: "100%", height: "100%" }}>
        <VBox
          id="inspected"
          style={{ padding: shifted ? { left: 5, top: 2 } : {} }}
          ref={(w: Widget | null) => {
            rootRef = w;
          }}
        >
          <Button id="alpha">Alpha</Button>
        </VBox>
        <DevTools root={rootRef} pick refreshMs={10} onInspect={(r) => reports.push(r)} />
      </VBox>
    );
    const t = await mountApp(tree(false), OPTS);
    await t.settle();
    // `root` is a plain closure variable, not React state — the first render
    // captured it as null (refs commit after render). Re-render once now that
    // rootRef is populated so DevTools actually has a tree to pick from.
    reconciler.updateContainer(tree(false), t.container, null, () => {});
    await t.settle();

    // Hover the button so pick-mode selects it.
    t.driver.simulateMouse(1, 0, "move", "none");
    await t.settle(30);
    const reportsAfterHover = reports.length;
    expect(reportsAfterHover).toBeGreaterThan(0);
    const firstRegion = reports[reports.length - 1] as { x: number; y: number };
    expect(firstRegion).toEqual({ x: 0, y: 0, width: expect.any(Number), height: 1 });

    // Re-layout the still-hovered widget (padding shift on its parent)
    // without changing which widget is hovered/selected.
    reconciler.updateContainer(tree(true), t.container, null, () => {});
    await t.settle(30);

    const latestRegion = reports[reports.length - 1] as { x: number; y: number };
    // Fresh poll ticks must pick up the moved region, not keep repeating the
    // stale one captured at selection time.
    expect(latestRegion.x).toBe(firstRegion.x + 5);
    expect(latestRegion.y).toBe(firstRegion.y + 2);
  });

  test("selecting a tree node shows its details and reports its region via onInspect", async () => {
    let rootRef: Widget | null = null;
    const reports: unknown[] = [];
    const t = await mountApp(
      <VBox style={{ width: "100%", height: "100%" }}>
        <VBox
          id="inspected"
          ref={(w: Widget | null) => {
            rootRef = w;
          }}
        >
          <Button id="alpha">Alpha</Button>
        </VBox>
        <DevTools root={rootRef} onInspect={(r) => reports.push(r)} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    reconciler.updateContainer(
      <VBox style={{ width: "100%", height: "100%" }}>
        <VBox
          id="inspected"
          ref={(w: Widget | null) => {
            rootRef = w;
          }}
        >
          <Button id="alpha">Alpha</Button>
        </VBox>
        <DevTools root={rootRef} onInspect={(r) => reports.push(r)} />
      </VBox>,
      t.container,
      null,
      () => {},
    );
    await t.settle();

    let treeWidget: Widget | undefined;
    t.screen.walk((n) => {
      if ((n as Widget).constructor?.name === "TreeWidget") treeWidget = n as Widget;
    });
    expect(treeWidget).toBeTruthy();
    (treeWidget as Widget).handleKey({ name: "down", handled: false } as never); // select the root
    await t.settle();
    expect(t.text()).not.toContain("Select a node…"); // detail list now shown instead
    (treeWidget as Widget).handleKey({ name: "down", handled: false } as never); // select "alpha"
    await t.settle();
    expect(reports.length).toBeGreaterThan(0);
    expect(t.text()).toContain("tag");
  });

  test("a full-frame reason list renders '● full' with its reasons", async () => {
    const t = await mountApp(
      <DevTools
        root={null}
        frame={{
          full: true,
          seq: 1,
          widgetsRendered: 5,
          bytes: 64,
          reasons: ["resize", "theme-change", "extra-reason"],
        }}
      />,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("● full");
    expect(text).toContain("resize, theme-change"); // only the first 2 reasons
  });

  test("a minimal frame (no bytes/reasons/sparkline history) still renders the profiler strip", async () => {
    const t = await mountApp(<DevTools root={null} frame={{ full: false, seq: 1 }} />, OPTS);
    await t.settle();
    const text = t.text();
    expect(text).toContain("○ scoped");
    expect(text).toContain("0 rendered");
    expect(text).toContain("0B");
  });

  test("null region renders nothing", async () => {
    const t = await mountApp(
      <VBox style={{ width: "100%", height: "100%" }}>
        <Label>abcdefgh</Label>
        <DevToolsHighlight region={null} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    // The label is untinted (its default background).
    expect(t.cellAt(2, 0).char).toBe("c");
  });
});
