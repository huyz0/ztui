import { useState } from "react";
import { describe, expect, test } from "vitest";
import {
  Box,
  closeLeaf,
  countLeaves,
  hydrateSplit,
  Label,
  type SplitLeaf,
  type SplitNode,
  SplitView,
  serializeSplit,
  splitLeaf,
  VBox,
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

  test("passing back a cached root reopens a closed pane (controlled reset)", async () => {
    // Regression: after a leaf closes, SplitView only ever read `root` on
    // mount — a fresh `root` object passed down later (the documented way to
    // restore a closed pane) was silently ignored.
    const original: SplitNode = {
      type: "split",
      direction: "row",
      children: [
        { type: "leaf", id: "left", content: <Label>LEFT_PANE</Label> },
        { type: "leaf", id: "right", content: <Label>RIGHT_PANE</Label> },
      ],
    };

    function Host() {
      const [root, setRoot] = useState<SplitNode>(original);
      return (
        <VBox style={{ width: "100%", height: "100%" }}>
          <Label id="reset" onClick={() => setRoot({ ...original })} style={{ height: 1 }}>
            reset
          </Label>
          <Box style={{ width: "100%", flexGrow: 1 }}>
            <SplitView root={root} controls newPane={() => "new"} />
          </Box>
        </VBox>
      );
    }

    const t = await mountApp(<Host />, { cols: 80, rows: 24 });
    expect(t.text()).toContain("LEFT_PANE");
    expect(t.text()).toContain("RIGHT_PANE");

    let closeBtn: any;
    t.screen.walk((n: any) => {
      if (!closeBtn && n.tagName === "label" && n.getTextContent?.() === "✕") closeBtn = n;
    });
    const { x, y } = closeBtn.region;
    t.driver.simulateMouse(x, y, "press", "left");
    t.driver.simulateMouse(x, y, "release", "left");
    await t.settle();
    expect(t.text()).not.toContain("LEFT_PANE");
    expect(t.text()).toContain("RIGHT_PANE");

    const reset = t.findById("reset")!;
    t.driver.simulateMouse(reset.region.x, reset.region.y, "press", "left");
    t.driver.simulateMouse(reset.region.x, reset.region.y, "release", "left");
    await t.settle();

    expect(t.text()).toContain("LEFT_PANE"); // the closed pane is back
    expect(t.text()).toContain("RIGHT_PANE");
  });

  test("two splits on the same pane fired before React flushes both apply, not just the second", async () => {
    // Regression: doSplit/doClose read the `tree` variable closed over at
    // render time and called setTree(splitLeaf(tree, ...)) directly. Two
    // split calls landing before React re-renders (e.g. a fast double-click)
    // both computed splitLeaf against the same stale single-leaf tree, so the
    // second commit's setTree call overwrote the first split's result
    // entirely instead of splitting the already-split tree further.
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
    let splitBtn: any;
    t.screen.walk((n: any) => {
      if (!splitBtn && n.tagName === "label" && n.getTextContent?.() === "↔") splitBtn = n;
    });
    expect(splitBtn).toBeTruthy();

    // Fire both clicks back-to-back, before settling in between.
    splitBtn.onClick?.({});
    splitBtn.onClick?.({});
    await t.settle();

    // Starts at 2 leaves; each split on the same original leaf adds one more.
    // Both must land: 2 -> 3 -> 4, not 2 -> 3 -> 3 (second overwriting the first).
    expect(latest && countLeaves(latest)).toBe(4);
  });

  test("stale splitter path into a collapsed leaf is a no-op (nodeAt guard)", async () => {
    // Regression coverage for nodeAt's early return: a splitter's onResize
    // closes over the path of its enclosing split at render time. If the tree
    // is swapped out from under it (e.g. an ancestor split collapsed down to
    // a leaf via closeLeaf) before the drag lands, resizeAt/nodeAt must walk
    // the now-stale path safely and bail out instead of indexing into a leaf
    // as if it were still a split.
    //
    //   root (row): [ leafA, A ]
    //   A    (col): [ S, leafY ]
    //   S    (row): [ G, leafZ ]
    //   G    (col): [ leafB, leafC ]
    //
    // Closing leafC collapses G into leafB; closing leafZ then collapses S
    // (now [leafB, leafZ]) into leafB too — so A's first child, once a
    // 3-deep split (S -> G -> leaves), becomes a single leaf directly.
    const deepTree: SplitNode = {
      type: "split",
      direction: "row",
      children: [
        leaf("leafA"),
        {
          type: "split",
          direction: "column",
          children: [
            {
              type: "split",
              direction: "row",
              children: [
                {
                  type: "split",
                  direction: "column",
                  children: [leaf("leafB"), leaf("leafC")],
                },
                leaf("leafZ"),
              ],
            },
            leaf("leafY"),
          ],
        },
      ],
    };

    let latest: SplitNode | undefined;
    function Host() {
      const [root, setRoot] = useState<SplitNode>(deepTree);
      return (
        <VBox style={{ width: "100%", height: "100%" }}>
          <Label
            id="collapse"
            onClick={() => setRoot((r) => closeLeaf(closeLeaf(r, "leafC"), "leafZ"))}
            style={{ height: 1 }}
          >
            collapse
          </Label>
          <Box style={{ width: "100%", flexGrow: 1 }}>
            <SplitView root={root} onChange={(r) => (latest = r)} />
          </Box>
        </VBox>
      );
    }

    const t = await mountApp(<Host />, { cols: 80, rows: 24 });

    // G is the innermost split, so its column splitter (horizontal) is the
    // last horizontal splitter encountered in render order (A's own column
    // splitter, between S and leafY, is the first).
    const horizontalSplitters: any[] = [];
    t.screen.walk((n: any) => {
      if (n.tagName === "splitter" && n.orientation === "horizontal") horizontalSplitters.push(n);
    });
    expect(horizontalSplitters.length).toBe(2);
    const staleSplitter = horizontalSplitters[1]; // G's own splitter (leafB | leafC)
    expect(staleSplitter.onResize).toBeTruthy();

    // Collapse S/G down into a single leaf, invalidating the splitter's
    // closed-over path ([1, 0, 0], G's original address).
    const collapseBtn = t.findById("collapse")!;
    t.driver.simulateMouse(collapseBtn.region.x, collapseBtn.region.y, "press", "left");
    t.driver.simulateMouse(collapseBtn.region.x, collapseBtn.region.y, "release", "left");
    await t.settle();

    // Firing the stale splitter's onResize now walks a path that dead-ends on
    // a leaf partway through — nodeAt must return undefined and resizeAt must
    // no-op rather than throwing or corrupting the tree.
    expect(() => staleSplitter.onResize?.(5)).not.toThrow();
    await t.settle();
    expect(latest?.type).toBe("split");
    expect(countLeaves(latest!)).toBe(3); // leafA, leafB (collapsed survivor), leafY
  });

  test("clicking ↕ splits the pane along the column axis", async () => {
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
    let splitBtn: any;
    t.screen.walk((n: any) => {
      if (!splitBtn && n.tagName === "label" && n.getTextContent?.() === "↕") splitBtn = n;
    });
    expect(splitBtn).toBeTruthy();
    const { x, y } = splitBtn.region;
    t.driver.simulateMouse(x, y, "press", "left");
    t.driver.simulateMouse(x, y, "release", "left");
    await t.settle();

    expect(latest && countLeaves(latest)).toBe(3);
    // The new split node introduced by "↕" must be a column split.
    const split = latest as Extract<SplitNode, { type: "split" }>;
    const inner = split.children.find((c) => c.type === "split") as
      | Extract<SplitNode, { type: "split" }>
      | undefined;
    expect(inner?.direction).toBe("column");
  });
});
