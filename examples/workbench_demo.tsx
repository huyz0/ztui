import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  App,
  Box,
  Header,
  Label,
  render,
  VBox,
  Workbench,
  type WorkbenchLayout,
  type WorkbenchPanel,
} from "../src/index.ts";

// Persist the layout to a temp file so re-launching restores the last state.
const LAYOUT_FILE = join(tmpdir(), "ztui-workbench-demo.json");
const savedLayout: WorkbenchLayout | undefined = existsSync(LAYOUT_FILE)
  ? JSON.parse(readFileSync(LAYOUT_FILE, "utf-8"))
  : undefined;
const saveLayout = (layout: WorkbenchLayout) =>
  writeFileSync(LAYOUT_FILE, JSON.stringify(layout, null, 2));

// IDE-style dockable workbench: an activity rail on each side toggles hideable
// side panels, a footer tab bar toggles the bottom panel, and the splitters
// between regions are drag-to-resize. Everything is mouse-driven.
const panels: WorkbenchPanel[] = [
  {
    id: "explorer",
    anchor: "left",
    title: "Explorer",
    icon: "folder",
    content: (
      <VBox>
        <Label>src/</Label>
        <Label> app.ts</Label>
        <Label> index.ts</Label>
        <Label> widgets/</Label>
      </VBox>
    ),
  },
  {
    id: "search",
    anchor: "left",
    title: "Search",
    icon: "magnifying-glass",
    content: <Label style={{ dim: true }}>Type to search…</Label>,
  },
  {
    id: "outline",
    anchor: "right",
    title: "Outline",
    icon: "list-bullet",
    content: (
      <VBox>
        <Label>Workbench()</Label>
        <Label>ActivityRail()</Label>
        <Label>PanelRegion()</Label>
      </VBox>
    ),
  },
  {
    id: "terminal",
    anchor: "bottom",
    title: "Terminal",
    content: (
      <VBox>
        <Label>$ npm test</Label>
        <Label style={{ color: "$success" }}>✓ 558 passed</Label>
      </VBox>
    ),
  },
  {
    id: "problems",
    anchor: "bottom",
    title: "Problems",
    content: <Label style={{ color: "$warning" }}>2 warnings, 0 errors</Label>,
  },
];

function WorkbenchDemo() {
  return (
    <VBox style={{ width: "100%", height: "100%", background: "#11111b" }}>
      <Header>
        🧱 ZTUI Workbench — drag to re-dock · drag splitters · Ctrl+B / Ctrl+Space toggle · Ctrl+C
        quit
      </Header>
      <Workbench
        panels={panels}
        initialOpen={["left"]}
        initialLayout={savedLayout}
        onLayoutChange={saveLayout}
        style={{ width: "100%", height: "1fr" }}
      >
        <Box style={{ padding: 1 }}>
          <Label>Editor area (center).</Label>
          <Label style={{ dim: true }}>Click the folder/search icons on the left rail,</Label>
          <Label style={{ dim: true }}>the outline icon on the right, or the bottom tabs.</Label>
        </Box>
      </Workbench>
    </VBox>
  );
}

const app = new App();
render(<WorkbenchDemo />, app.activeScreen);
app.run();
