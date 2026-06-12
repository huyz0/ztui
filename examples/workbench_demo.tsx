import {
  App,
  Box,
  Header,
  Label,
  render,
  VBox,
  Workbench,
  type WorkbenchPanel,
} from "../src/index.ts";

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
        🧱 ZTUI Workbench — click rail icons / footer tabs · drag splitters · Ctrl+C quit
      </Header>
      <Workbench panels={panels} initialOpen={["left"]} style={{ width: "100%", height: "100%" }}>
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
