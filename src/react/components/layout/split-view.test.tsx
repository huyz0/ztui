import { describe, expect, test } from "vitest";
import {
  closeLeaf,
  countLeaves,
  hydrateSplit,
  Label,
  type SplitLeaf,
  type SplitNode,
  SplitView,
  serializeSplit,
  splitLeaf,
} from "../../../react.ts";
import { mountApp } from "../../../test/harness.tsx";

const leaf = (id: string): SplitLeaf => ({ type: "leaf", id, content: id });

// A row split with a nested column on the right:
//   ┌──────┬──────┐
//   │  A   │  B   │
//   │      ├──────┤
//   │      │  C   │
//   └──────┴──────┘
const tree: SplitNode = {
  type: "split",
  direction: "row",
  sizes: [1, 1],
  children: [
    { type: "leaf", id: "a", content: <Label>PANE_A</Label> },
    {
      type: "split",
      direction: "column",
      sizes: [1, 1],
      children: [
        { type: "leaf", id: "b", content: <Label>PANE_B</Label> },
        { type: "leaf", id: "c", content: <Label>PANE_C</Label> },
      ],
    },
  ],
};

function findSplitter(
  t: Awaited<ReturnType<typeof mountApp>>,
  orientation: "vertical" | "horizontal",
) {
  let found: import("../../../dom/widget.ts").Widget | undefined;
  t.screen.walk((node: any) => {
    if (!found && node.tagName === "splitter" && node.orientation === orientation) found = node;
  });
  return found;
}

describe("SplitView", () => {
  test("renders all leaves of a nested tree", async () => {
    const t = await mountApp(<SplitView root={tree} />, { cols: 60, rows: 16 });
    const screen = t.text();
    expect(screen).toContain("PANE_A");
    expect(screen).toContain("PANE_B");
    expect(screen).toContain("PANE_C");
  });

  test("equal sizes split the area down the middle", async () => {
    const t = await mountApp(<SplitView root={tree} />, { cols: 80, rows: 24 });
    // The vertical splitter (between A and the right column) sits near the
    // horizontal midpoint of the 80-wide area (minus its own 1 cell).
    const v = findSplitter(t, "vertical");
    expect(v).toBeTruthy();
    expect(v!.region.x).toBeGreaterThanOrEqual(38);
    expect(v!.region.x).toBeLessThanOrEqual(41);
  });

  test("dragging the vertical splitter re-weights the panes and fires onChange", async () => {
    let latest: SplitNode | undefined;
    const t = await mountApp(<SplitView root={tree} onChange={(r) => (latest = r)} />, {
      cols: 80,
      rows: 24,
    });
    const v = findSplitter(t, "vertical")!;
    const startX = v.region.x;
    // Drag the divider 9 cells to the right.
    t.driver.simulateMouse(startX, 5, "press", "left");
    t.driver.simulateMouse(startX + 9, 5, "drag", "left");
    t.driver.simulateMouse(startX + 9, 5, "release", "left");
    await t.settle();

    // The left pane (A) grew, so the divider moved right.
    const moved = findSplitter(t, "vertical")!;
    expect(moved.region.x).toBeGreaterThan(startX);
    // onChange reported a tree whose root sizes now favor the left pane.
    expect(latest?.type).toBe("split");
    const sizes = (latest as any).sizes as number[];
    expect(sizes[0]).toBeGreaterThan(sizes[1]);
  });
});

describe("SplitView tree helpers", () => {
  test("splitLeaf wraps a leaf in a 2-child split", () => {
    const t = splitLeaf(leaf("a"), "a", "row", leaf("b"));
    expect(t).toEqual({
      type: "split",
      direction: "row",
      sizes: [1, 1],
      children: [leaf("a"), leaf("b")],
    });
    expect(countLeaves(t)).toBe(2);
  });

  test("splitLeaf is a no-op for an unknown id", () => {
    const root = splitLeaf(leaf("a"), "zzz", "row", leaf("b"));
    expect(root).toEqual(leaf("a"));
  });

  test("closeLeaf drops a pane and its size weight", () => {
    const root: SplitNode = {
      type: "split",
      direction: "row",
      sizes: [2, 1, 1],
      children: [leaf("a"), leaf("b"), leaf("c")],
    };
    const t = closeLeaf(root, "b") as Extract<SplitNode, { type: "split" }>;
    expect(t.children).toEqual([leaf("a"), leaf("c")]);
    expect(t.sizes).toEqual([2, 1]);
  });

  test("closeLeaf collapses a split left with one child", () => {
    const root: SplitNode = {
      type: "split",
      direction: "row",
      children: [
        leaf("a"),
        { type: "split", direction: "column", children: [leaf("b"), leaf("c")] },
      ],
    };
    // Remove c → inner column has only b → collapses to leaf b.
    const t = closeLeaf(root, "c") as Extract<SplitNode, { type: "split" }>;
    expect(t.children).toEqual([leaf("a"), leaf("b")]);
  });

  test("serializeSplit strips content; hydrateSplit restores it (round-trip)", () => {
    const tree: SplitNode = {
      type: "split",
      direction: "row",
      sizes: [2, 1],
      children: [
        leaf("a"),
        { type: "split", direction: "column", children: [leaf("b"), leaf("c")] },
      ],
    };
    const serialized = serializeSplit(tree);
    // JSON-safe: no ReactNode content anywhere.
    expect(JSON.stringify(serialized)).toBe(
      JSON.stringify({
        type: "split",
        direction: "row",
        sizes: [2, 1],
        children: [
          { type: "leaf", id: "a" },
          {
            type: "split",
            direction: "column",
            children: [
              { type: "leaf", id: "b" },
              { type: "leaf", id: "c" },
            ],
          },
        ],
      }),
    );
    // Re-hydrate from a JSON round-trip, sourcing content by id.
    const restored = hydrateSplit(JSON.parse(JSON.stringify(serialized)), (id) => `body:${id}`);
    expect(serializeSplit(restored)).toEqual(serialized); // structure preserved
    const a = (restored as any).children[0] as SplitLeaf;
    expect(a.content).toBe("body:a"); // content rebuilt from the factory
  });
});

describe("SplitView interactive controls", () => {
  const interactiveTree: SplitNode = {
    type: "split",
    direction: "row",
    children: [leaf("left"), leaf("right")],
  };

  test("clicking ✕ closes a pane", async () => {
    let latest: SplitNode | undefined;
    const t = await mountApp(
      <SplitView
        root={interactiveTree}
        controls
        newPane={() => "new"}
        onChange={(r) => (latest = r)}
      />,
      { cols: 80, rows: 24 },
    );
    expect(countLeaves(interactiveTree)).toBe(2);
    // The left pane's ✕ sits at the right edge of the left half's toolbar
    // (row 0). Click it.
    let closeBtn: any;
    t.screen.walk((n: any) => {
      // The first label whose text is the close glyph.
      if (!closeBtn && n.tagName === "label" && n.getTextContent?.() === "✕") closeBtn = n;
    });
    expect(closeBtn).toBeTruthy();
    const { x, y } = closeBtn.region;
    t.driver.simulateMouse(x, y, "press", "left");
    t.driver.simulateMouse(x, y, "release", "left");
    await t.settle();
    expect(latest && countLeaves(latest)).toBe(1);
  });
});
