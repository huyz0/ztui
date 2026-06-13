import {
  Box,
  Header,
  Label,
  type SplitNode,
  SplitView,
  ThemePalette,
  VBox,
  Workbench,
  type WorkbenchPanel,
} from "../src/index.ts";

// The full IDE layout: a Workbench (hideable side/bottom panels + activity rail)
// wrapping a SplitView editor grid in the center. Everything is mouse-driven —
// click rail icons, drag panels to re-dock, drag splitters, split/close panes —
// plus Ctrl+B (left), Ctrl+Alt+B (right), Ctrl+Space (bottom) to toggle regions.

// Pane body — SplitView draws each leaf's flat title bar from its `title` field.
const body = (text: string, color?: string) => (
  <Box style={{ padding: { left: 1, top: 1 } }}>
    <Label style={{ color }}>{text}</Label>
  </Box>
);

const editorGrid: SplitNode = {
  type: "split",
  direction: "row",
  sizes: [3, 2],
  children: [
    { type: "leaf", id: "app.tsx", title: "app.tsx", content: body("export function App() { … }") },
    {
      type: "split",
      direction: "column",
      sizes: [1, 1],
      children: [
        { type: "leaf", id: "preview", title: "Preview", content: body("live output", "$success") },
        { type: "leaf", id: "notes.md", title: "notes.md", content: body("# TODO", "$primary") },
      ],
    },
  ],
};

const panels: WorkbenchPanel[] = [
  {
    id: "explorer",
    anchor: "left",
    title: "Explorer",
    icon: "folder",
    content: (
      <VBox>
        <Label>src/</Label>
        <Label> app.tsx</Label>
        <Label> index.ts</Label>
        <Label>notes.md</Label>
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
    id: "git",
    anchor: "left",
    title: "Source Control",
    icon: "code-bracket",
    content: <Label style={{ color: "$warning" }}>3 changes</Label>,
  },
  {
    id: "outline",
    anchor: "right",
    title: "Outline",
    icon: "list-bullet",
    content: (
      <VBox>
        <Label>App()</Label>
        <Label>Editor()</Label>
        <Label>Sidebar()</Label>
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
        <Label style={{ color: "$success" }}>✓ 577 passed</Label>
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

function IDEDemo() {
  return (
    <VBox style={{ width: "100%", height: "100%", background: "$surface" }}>
      <ThemePalette />
      <Header>
        🧰 ZTUI IDE — drag to re-dock · split/resize panes · Ctrl+B / Ctrl+Space toggle · Ctrl+C
        quit
      </Header>
      <Workbench
        panels={panels}
        initialOpen={["left", "bottom"]}
        style={{ width: "100%", height: "1fr" }}
      >
        <SplitView root={editorGrid} controls newPane={(id) => body(`split of ${id}`)} />
      </Workbench>
    </VBox>
  );
}

import type { Demo } from "./gallery/types.ts";

export const ideDemo: Demo = {
  id: "ide",
  title: "IDE",
  group: "Layout",
  description: "Dockable IDE-style workbench.",
  Component: IDEDemo,
};
