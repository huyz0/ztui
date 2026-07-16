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
import { mountApp, waitFor } from "../../../test/harness.tsx";

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

  test("Ctrl+Alt+B toggles the right region", async () => {
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    expect(t.text()).not.toContain("OUTLINEBODY"); // right starts closed
    // Terminals report Meta/Alt as one modifier, delivered as `meta` on the
    // KeyEvent (see hotkeys.ts's MOD_ALIASES); simulateKey's 5th arg is meta.
    const deadline = Date.now() + 2000;
    while (!t.text().includes("OUTLINEBODY")) {
      if (Date.now() >= deadline) throw new Error("Ctrl+Alt+B did not open the right region");
      t.driver.simulateKey("b", "b", true, false, true); // ctrl+alt+b
      await t.settle(20);
    }
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

  test("dragging a rail icon to the dead-center zone doesn't re-dock it", async () => {
    // The center band (not near an edge, not in the lower third) maps to no
    // drop zone (zoneAt returns null); dragging there must leave the panel
    // where it was instead of re-docking to some fallback region.
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    expect(t.text()).toContain("FILES"); // Explorer active on the left
    expect(t.text()).not.toContain("SEARCHBODY");
    await dragRailTo(t, "explorer", 40, 10); // dead-center of an 80x24 area
    expect(t.text()).toContain("FILES"); // still on the left, unchanged
    expect(t.text()).not.toContain("SEARCHBODY"); // sibling wasn't promoted
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

  test("dragging the left splitter past the container edge clamps instead of overrunning it", async () => {
    // Regression: resize() only clamped the minimum (Math.max(min, ...)), so
    // a drag gesture whose delta exceeds the container's own width could grow
    // the panel past the visible area, squeezing the center content (and any
    // opposite-side panel) to zero or negative width.
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    let sp: any;
    t.screen.walk((n: any) => {
      if (!sp && n.tagName === "splitter" && n.orientation === "vertical") sp = n;
    });
    const startX = sp.region.x;
    // Drag far past the right edge of an 80-col container.
    t.driver.simulateMouse(startX, 10, "press", "left");
    t.driver.simulateMouse(startX + 500, 10, "drag", "left");
    t.driver.simulateMouse(startX + 500, 10, "release", "left");
    await t.settle();
    let sp2: any;
    t.screen.walk((n: any) => {
      if (!sp2 && n.tagName === "splitter" && n.orientation === "vertical") sp2 = n;
    });
    // The splitter must not have run off the right edge of the container.
    expect(sp2.region.x).toBeLessThan(80);
    // The center content is still visible, not squeezed away entirely.
    expect(t.text()).toContain("EDITOR");
  });

  test("dragging the right splitter resizes the right panel", async () => {
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    await tapRail(t, "outline"); // open the right region
    expect(t.text()).toContain("OUTLINEBODY");

    let sp: any;
    t.screen.walk((n: any) => {
      if (n.tagName === "splitter" && n.orientation === "vertical" && n.region.x > 40) sp = n;
    });
    expect(sp).toBeTruthy();
    const startX = sp.region.x;
    // Right grows leftward on a negative delta (dragging left widens it).
    t.driver.simulateMouse(startX, 10, "press", "left");
    t.driver.simulateMouse(startX - 6, 10, "drag", "left");
    t.driver.simulateMouse(startX - 6, 10, "release", "left");
    await t.settle();

    let sp2: any;
    t.screen.walk((n: any) => {
      if (n.tagName === "splitter" && n.orientation === "vertical" && n.region.x < startX) sp2 = n;
    });
    expect(sp2.region.x).toBe(startX - 6);
  });

  test("dragging the bottom splitter resizes the bottom panel", async () => {
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    await pressUntil(t, "space", () => t.text().includes("TERMBODY")); // open bottom

    let sp: any;
    t.screen.walk((n: any) => {
      if (n.tagName === "splitter" && n.orientation === "horizontal") sp = n;
    });
    expect(sp).toBeTruthy();
    const startY = sp.region.y;
    // Bottom grows upward on a negative delta (dragging up widens it). The
    // bottom splitter only spans the center column (not the left/right
    // regions), so click within its own region rather than a hardcoded x.
    const clickX = sp.region.x + 1;
    t.driver.simulateMouse(clickX, startY, "press", "left");
    t.driver.simulateMouse(clickX, startY - 3, "drag", "left");
    t.driver.simulateMouse(clickX, startY - 3, "release", "left");
    await t.settle();

    let sp2: any;
    t.screen.walk((n: any) => {
      if (n.tagName === "splitter" && n.orientation === "horizontal") sp2 = n;
    });
    expect(sp2.region.y).toBe(startY - 3);
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
    // onLayoutChange fires the initial snapshot from a mount effect — wait for
    // it rather than racing the fixed mount settle under CI load.
    await waitFor(() => snapshots.length > 0);

    // A click produces a new snapshot reflecting the mutation.
    snapshots.length = 0;
    await tapRail(t, "explorer"); // open left on Explorer
    await waitFor(() => snapshots.at(-1)?.regions.left.open === true);
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

  test("two rapid re-docks in the same tick repair the source region to the true remaining sibling", async () => {
    // Regression: move()'s sibling lookup used the closure-captured
    // `overrides` from render, not the value being written by the concurrent
    // setOverrides call in the same handler. With three left panels, moving
    // the first two away in the same tick (no render in between) made the
    // second move()'s sibling search use a stale `overrides` that didn't yet
    // know about the first move — so it could "repair" the left region's
    // active id back to the panel that had just been moved away instead of
    // the panel that's genuinely still there.
    const threePanels = [
      ...panels,
      { id: "notes", anchor: "left" as const, title: "Notes", content: <Label>NOTESBODY</Label> },
    ];
    const t = await mountApp(
      <VBox style={{ width: "100%", height: "100%" }}>
        <Workbench panels={threePanels} initialOpen={["left"]}>
          <Label>EDITOR</Label>
        </Workbench>
      </VBox>,
      { cols: 80, rows: 24 },
    );
    expect(t.text()).toContain("FILES"); // Explorer active on the left

    // Drag both Explorer and Search to the right zone with no settle in
    // between — both `move()` calls run against the same pre-render
    // `overrides` closure. Notes is the only left panel left afterward.
    const explorer = railCenter(t, "explorer");
    t.driver.simulateMouse(explorer.x, explorer.y, "press", "left");
    t.driver.simulateMouse(79, 0, "drag", "left");
    t.driver.simulateMouse(79, 0, "release", "left");

    const search = railCenter(t, "search");
    t.driver.simulateMouse(search.x, search.y, "press", "left");
    t.driver.simulateMouse(79, 0, "drag", "left");
    t.driver.simulateMouse(79, 0, "release", "left");

    await t.settle();

    // The left region must show Notes — the one panel genuinely still
    // anchored there — not Explorer, which moved to the right and is no
    // longer visible anywhere (Search, docked right after it, is the
    // right region's active panel now).
    expect(t.text()).toContain("NOTESBODY");
    expect(t.text()).toContain("SEARCHBODY");
    expect(t.text()).not.toContain("FILES");
  });

  test("dragging over the right rail tints it as the drop target", async () => {
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    const explorer = railCenter(t, "explorer");
    t.driver.simulateMouse(explorer.x, explorer.y, "press", "left");
    t.driver.simulateMouse(79, 0, "drag", "left"); // hover over the right zone
    await t.settle();

    let rightRail: any;
    t.screen.walk((n: any) => {
      if (n.id === "rail-outline") rightRail = n;
    });
    expect(rightRail).toBeTruthy();
    // ActivityRail's own background follows the same dropTarget prop; walk up
    // to the rail VBox (the icon's parent) to read it.
    expect((rightRail.parent as { style?: { background?: string } }).style?.background).toBe(
      "$primary",
    );

    t.driver.simulateMouse(79, 0, "release", "left");
    await t.settle();
  });

  test("panels with no right or bottom entries render without those docks", async () => {
    const leftOnly: WorkbenchPanel[] = [
      { id: "explorer", anchor: "left", title: "Explorer", content: <Label>FILES</Label> },
    ];
    const t = await mountApp(
      <VBox style={{ width: "100%", height: "100%" }}>
        <Workbench panels={leftOnly} initialOpen={["left"]}>
          <Label>EDITOR</Label>
        </Workbench>
      </VBox>,
      { cols: 80, rows: 24 },
    );
    expect(t.text()).toContain("FILES");
    expect(t.text()).toContain("EDITOR");
    let horizontalSplitter: unknown;
    let rightRail: unknown;
    t.screen.walk((n: any) => {
      if (n.tagName === "splitter" && n.orientation === "horizontal") horizontalSplitter = n;
      if (n.id === "rail-outline") rightRail = n;
    });
    expect(horizontalSplitter).toBeUndefined();
    expect(rightRail).toBeUndefined();
  });

  test("dragging within its own region is a no-op (doesn't re-dock)", async () => {
    // A drag that ends inside the same zone it started in must not call
    // move() — target === source, so it's treated the same as "not moved"
    // for docking purposes even though the pointer did travel.
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    expect(t.text()).toContain("FILES");
    expect(t.text()).not.toContain("SEARCHBODY");
    const { x, y } = railCenter(t, "explorer");
    t.driver.simulateMouse(x, y, "press", "left");
    t.driver.simulateMouse(x + 2, y + 2, "drag", "left"); // still inside the left zone
    t.driver.simulateMouse(x + 2, y + 2, "release", "left");
    await t.settle();
    expect(t.text()).toContain("FILES"); // unchanged: still active on the left
    expect(t.text()).not.toContain("SEARCHBODY"); // sibling wasn't promoted
  });

  test("dragging the only bottom panel elsewhere leaves the bottom region empty and closed", async () => {
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    await pressUntil(t, "space", () => t.text().includes("TERMBODY")); // open bottom
    expect(t.text()).toContain("TERMBODY");

    let terminalRail: any;
    t.screen.walk((n: any) => {
      if (n.id === "rail-terminal") terminalRail = n;
    });
    // The bottom tab is a Label, not a rail icon; find it directly.
    let terminalTab: any;
    t.screen.walk((n: any) => {
      if (!terminalTab && n.tagName === "label" && n.getTextContent?.() === "Terminal") {
        terminalTab = n;
      }
    });
    expect(terminalTab).toBeTruthy();
    const r = terminalTab.region;
    t.driver.simulateMouse(r.x, r.y, "press", "left");
    t.driver.simulateMouse(79, 0, "drag", "left"); // drag to the right zone
    t.driver.simulateMouse(79, 0, "release", "left");
    await t.settle();

    // Terminal re-docked to the right; the bottom region is now empty and
    // collapsed (no sibling to fall back to).
    expect(t.text()).toContain("TERMBODY");
    let horizontalSplitter: unknown;
    t.screen.walk((n: any) => {
      if (n.tagName === "splitter" && n.orientation === "horizontal") horizontalSplitter = n;
    });
    expect(horizontalSplitter).toBeUndefined();
    void terminalRail;
  });

  test("dragging a rail icon down to the bottom zone re-docks it and tints the tab bar", async () => {
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    const { x, y } = railCenter(t, "explorer");
    t.driver.simulateMouse(x, y, "press", "left");
    t.driver.simulateMouse(40, 20, "drag", "left"); // lower third → bottom zone
    await t.settle();

    // While hovering, the bottom tab bar (a Box) tints to $primary.
    let bottomBar: any;
    t.screen.walk((n: any) => {
      if (n.tagName === "box" && n.style?.dock === "bottom" && n.style?.height === 1) bottomBar = n;
    });
    expect(bottomBar).toBeTruthy();
    expect(bottomBar.style.background).toBe("$primary");

    t.driver.simulateMouse(40, 20, "release", "left");
    await t.settle();
    expect(t.text()).toContain("FILES"); // Explorer re-docked to the bottom, still visible
  });

  test("re-docking a non-active sibling doesn't disturb the source region's active panel", async () => {
    // "explorer" is the active left panel; "search" is an inactive sibling.
    // Moving "search" elsewhere must leave the left region's active panel
    // (explorer) untouched — the source-repair logic only kicks in when the
    // *active* panel is the one being moved.
    const t = await mountApp(ui(), { cols: 80, rows: 24 });
    expect(t.text()).toContain("FILES"); // explorer active on the left
    await dragRailTo(t, "search", 79, 0); // drag the inactive sibling to the right zone
    expect(t.text()).toContain("FILES"); // left's active panel is unchanged
    expect(t.text()).toContain("SEARCHBODY"); // search now shows, re-docked to the right
  });

  test("panels with no left entries render without the left rail/dock", async () => {
    const rightAndBottomOnly: WorkbenchPanel[] = [
      { id: "outline", anchor: "right", title: "Outline", content: <Label>OUTLINEBODY</Label> },
      { id: "terminal", anchor: "bottom", title: "Terminal", content: <Label>TERMBODY</Label> },
    ];
    const t = await mountApp(
      <VBox style={{ width: "100%", height: "100%" }}>
        <Workbench panels={rightAndBottomOnly} initialOpen={["right"]}>
          <Label>EDITOR</Label>
        </Workbench>
      </VBox>,
      { cols: 80, rows: 24 },
    );
    expect(t.text()).toContain("EDITOR");
    let leftRail: unknown;
    t.screen.walk((n: any) => {
      if (n.id === "rail-outline" || n.id === "rail-terminal") return;
      if (typeof n.id === "string" && n.id.startsWith("rail-")) leftRail = n;
    });
    expect(leftRail).toBeUndefined();
  });
});
