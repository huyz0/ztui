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
} from "../../../react.ts";
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

type Mounted = Awaited<ReturnType<typeof mountApp>>;

// Center of a rail icon, found by id so tests don't depend on rail geometry.
function railCenter(t: Mounted, panelId: string) {
  const w = t.findById(`rail-${panelId}`);
  if (!w) throw new Error(`rail icon for ${panelId} not found`);
  const r = w.region;
  return { x: r.x + Math.floor(r.width / 2), y: r.y + Math.floor(r.height / 2) };
}

// Press a (ctrl) hotkey until `predicate` holds. Robust to the simulated key
// being dropped on the odd frame under load: it only re-sends while the state
// hasn't changed yet, so it never double-toggles. Throws on timeout.
async function pressUntil(
  t: Mounted,
  key: string,
  predicate: () => boolean,
  timeout = 2000,
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline)
      throw new Error(`pressUntil(${key}): condition not met in ${timeout}ms`);
    t.driver.simulateKey(key, key, true); // ctrl+<key>
    await t.settle(20);
  }
}

async function tapRail(t: Mounted, panelId: string) {
  const { x, y } = railCenter(t, panelId);
  t.driver.simulateMouse(x, y, "press", "left");
  t.driver.simulateMouse(x, y, "release", "left");
  await t.settle();
}

async function dragRailTo(t: Mounted, panelId: string, toX: number, toY: number) {
  const { x, y } = railCenter(t, panelId);
  t.driver.simulateMouse(x, y, "press", "left");
  t.driver.simulateMouse(toX, toY, "drag", "left");
  t.driver.simulateMouse(toX, toY, "release", "left");
  await t.settle();
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
    await tapRail(t, "outline");
    expect(t.text()).toContain("OUTLINEBODY");
    expect(t.text()).toContain("Outline");
  });

  test("clicking the active left-rail icon collapses the region", async () => {
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    expect(t.text()).toContain("FILES");
    await tapRail(t, "explorer"); // active panel's icon → collapse
    expect(t.text()).not.toContain("FILES");
  });

  test("switching left tabs swaps the active panel without closing", async () => {
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    expect(t.text()).toContain("FILES");
    await tapRail(t, "search"); // second left icon → switch active
    expect(t.text()).toContain("SEARCHBODY");
    expect(t.text()).not.toContain("FILES");
  });

  test("Ctrl+B toggles the left region", async () => {
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    expect(t.text()).toContain("FILES"); // left starts open
    await pressUntil(t, "b", () => !t.text().includes("FILES")); // ctrl+b collapses
    await pressUntil(t, "b", () => t.text().includes("FILES")); // ctrl+b reopens
  });

  test("the bottom toggle key opens the bottom region", async () => {
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    expect(t.text()).not.toContain("TERMBODY"); // bottom starts closed
    // Default bottom key is ctrl+space (terminals deliver ctrl+j as Enter).
    await pressUntil(t, "space", () => t.text().includes("TERMBODY"));
  });

  test("toggleKeys overrides the default bindings", async () => {
    const t = await mountApp(
      <VBox style={{ width: "100%", height: "100%" }}>
        <Workbench panels={panels} initialOpen={["left"]} toggleKeys={{ left: "ctrl+n" }}>
          <Label>EDITOR</Label>
        </Workbench>
      </VBox>,
      { cols: 80, rows: 24 },
    );
    expect(t.text()).toContain("FILES");
    await pressUntil(t, "n", () => !t.text().includes("FILES")); // ctrl+n closes left
  });

  test("dragging a left-rail icon to the right zone re-docks the panel", async () => {
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    expect(t.text()).toContain("FILES"); // Explorer (left, active)
    expect(t.text()).not.toContain("SEARCHBODY"); // Search not active yet
    await dragRailTo(t, "explorer", 79, 0); // drag to the right zone
    // Explorer now lives on the right (its body still shows)...
    expect(t.text()).toContain("FILES");
    // ...and the left region repaired its active panel to the sibling (Search).
    expect(t.text()).toContain("SEARCHBODY");
  });

  test("dragging the left splitter resizes the panel", async () => {
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    // Rail (2) + panel (26) puts the vertical splitter at x=28.
    let sp: any;
    t.screen.walk((n: any) => {
      if (!sp && n.tagName === "splitter" && n.orientation === "vertical") sp = n;
    });
    const startX = sp.region.x;
    t.driver.simulateMouse(startX, 10, "press", "left");
    t.driver.simulateMouse(startX + 6, 10, "drag", "left");
    t.driver.simulateMouse(startX + 6, 10, "release", "left");
    await t.settle();
    let sp2: any;
    t.screen.walk((n: any) => {
      if (!sp2 && n.tagName === "splitter" && n.orientation === "vertical") sp2 = n;
    });
    expect(sp2.region.x).toBe(startX + 6); // panel widened by the drag
  });

  test("a tap (no movement) toggles instead of moving", async () => {
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    expect(t.text()).toContain("FILES");
    // press+release at the same cell → moved=false → toggle (collapse).
    await tapRail(t, "explorer");
    expect(t.text()).not.toContain("FILES");
  });

  test("restores from initialLayout and reports changes via onLayoutChange", async () => {
    const snapshots: WorkbenchLayout[] = [];
    const restore: WorkbenchLayout = {
      regions: {
        left: { open: false, size: 26, active: "search" },
        right: { open: true, size: 20, active: "outline" },
        bottom: { open: false, size: 8, active: "terminal" },
      },
      overrides: {},
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
    await tapRail(t, "explorer"); // open left on Explorer
    expect(snapshots.at(-1)?.regions.left.open).toBe(true);
    expect(snapshots.at(-1)?.regions.left.active).toBe("explorer");
  });

  test("persists drag-move overrides in the layout snapshot", async () => {
    const snapshots: WorkbenchLayout[] = [];
    const t = await mountApp(
      <VBox style={{ width: "100%", height: "100%" }}>
        <Workbench panels={panels} initialOpen={["left"]} onLayoutChange={(l) => snapshots.push(l)}>
          <Label>EDITOR</Label>
        </Workbench>
      </VBox>,
      { cols: 80, rows: 24 },
    );
    // Drag Explorer from the left rail to the right zone.
    await dragRailTo(t, "explorer", 79, 0);
    expect(snapshots.at(-1)?.overrides.explorer).toBe("right");

    // Feeding that snapshot back as initialLayout restores the re-dock.
    const saved = snapshots.at(-1)!;
    const t2 = await mountApp(
      <VBox style={{ width: "100%", height: "100%" }}>
        <Workbench panels={panels} initialLayout={saved}>
          <Label>EDITOR</Label>
        </Workbench>
      </VBox>,
      { cols: 80, rows: 24 },
    );
    // Explorer is docked right now (open + active there).
    expect(t2.text()).toContain("FILES");
    expect(t2.text()).toContain("Explorer");
  });
});
