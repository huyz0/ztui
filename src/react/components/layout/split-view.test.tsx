import { describe, expect, test } from "vitest";
import { Label, type SplitNode, SplitView } from "../../../index.ts";
import { mountApp } from "../../../test/harness.tsx";

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
  let found: import("../../../index.ts").Widget | undefined;
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
