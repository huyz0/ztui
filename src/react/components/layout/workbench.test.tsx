import { describe, expect, test } from "vitest";
// Import from the package barrel so widget element registration (the
// `import "./widgets/index.ts"` side effect in index.ts) runs — without it the
// reconciler has no factories and renders nothing.
import {
  Label,
  VBox,
  Workbench,
  type WorkbenchLayout,
  type WorkbenchPanel,
} from "../../../index.ts";
import { mountApp } from "../../../test/harness.tsx";

const panels: WorkbenchPanel[] = [
  {
    id: "explorer",
    anchor: "left",
    title: "Explorer",
    icon: "folder",
    content: <Label>FILES</Label>,
  },
  {
    id: "search",
    anchor: "left",
    title: "Search",
    icon: "magnifying-glass",
    content: <Label>SEARCHBODY</Label>,
  },
  {
    id: "outline",
    anchor: "right",
    title: "Outline",
    icon: "list-bullet",
    content: <Label>OUTLINEBODY</Label>,
  },
  { id: "terminal", anchor: "bottom", title: "Terminal", content: <Label>TERMBODY</Label> },
];

function ui() {
  return (
    <VBox style={{ width: "100%", height: "100%" }}>
      <Workbench panels={panels} initialOpen={["left"]}>
        <Label>EDITOR</Label>
      </Workbench>
    </VBox>
  );
}

describe("Workbench", () => {
  test("opens the initialOpen region and shows the center content", async () => {
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    const screen = t.text();
    expect(screen).toContain("Explorer"); // left panel border title
    expect(screen).toContain("FILES"); // left panel body
    expect(screen).toContain("EDITOR"); // center content
    expect(screen).not.toContain("OUTLINEBODY"); // right region closed
    expect(screen).not.toContain("TERMBODY"); // bottom region closed
  });

  test("clicking a right-rail icon opens that panel", async () => {
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    expect(t.text()).not.toContain("OUTLINEBODY");
    // Right rail is the rightmost 2 columns; its single icon sits on the first row.
    t.driver.simulateMouse(79, 0, "press", "left");
    t.driver.simulateMouse(79, 0, "release", "left");
    await t.settle();
    expect(t.text()).toContain("OUTLINEBODY");
    expect(t.text()).toContain("Outline");
  });

  test("clicking the active left-rail icon collapses the region", async () => {
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    expect(t.text()).toContain("FILES");
    // Explorer is the first (active) left icon at column 0, row 0.
    t.driver.simulateMouse(0, 0, "press", "left");
    t.driver.simulateMouse(0, 0, "release", "left");
    await t.settle();
    expect(t.text()).not.toContain("FILES");
  });

  test("switching left tabs swaps the active panel without closing", async () => {
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    expect(t.text()).toContain("FILES");
    // Second left icon (Search) is at column 0, row 1.
    t.driver.simulateMouse(0, 1, "press", "left");
    t.driver.simulateMouse(0, 1, "release", "left");
    await t.settle();
    expect(t.text()).toContain("SEARCHBODY");
    expect(t.text()).not.toContain("FILES");
  });

  test("Ctrl+B toggles the left region", async () => {
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    expect(t.text()).toContain("FILES"); // left starts open
    t.driver.simulateKey("b", "b", true); // ctrl+b
    await t.settle();
    expect(t.text()).not.toContain("FILES"); // collapsed
    t.driver.simulateKey("b", "b", true);
    await t.settle();
    expect(t.text()).toContain("FILES"); // reopened
  });

  test("Ctrl+J toggles the bottom region", async () => {
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    expect(t.text()).not.toContain("TERMBODY"); // bottom starts closed
    t.driver.simulateKey("j", "j", true); // ctrl+j
    await t.settle();
    expect(t.text()).toContain("TERMBODY");
  });

  test("restores from initialLayout and reports changes via onLayoutChange", async () => {
    const snapshots: WorkbenchLayout[] = [];
    const restore: WorkbenchLayout = {
      left: { open: false, size: 26, active: "search" },
      right: { open: true, size: 20, active: "outline" },
      bottom: { open: false, size: 8, active: "terminal" },
    };
    const t = await mountApp(
      <VBox style={{ width: "100%", height: "100%" }}>
        <Workbench
          panels={panels}
          initialLayout={restore}
          onLayoutChange={(l) => snapshots.push(l)}
        >
          <Label>EDITOR</Label>
        </Workbench>
      </VBox>,
      { cols: 80, rows: 24 },
    );
    // Restored: left closed, right open on Outline.
    expect(t.text()).not.toContain("FILES");
    expect(t.text()).toContain("OUTLINEBODY");
    // onLayoutChange fired at least the initial snapshot.
    expect(snapshots.length).toBeGreaterThan(0);

    // A click produces a new snapshot reflecting the mutation.
    snapshots.length = 0;
    t.driver.simulateMouse(0, 0, "press", "left"); // open left on Explorer
    t.driver.simulateMouse(0, 0, "release", "left");
    await t.settle();
    expect(snapshots.at(-1)?.left.open).toBe(true);
    expect(snapshots.at(-1)?.left.active).toBe("explorer");
  });
});
