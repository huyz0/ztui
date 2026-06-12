import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  App,
  Box,
  Header,
  hydrateSplit,
  Label,
  render,
  type SerializedSplitNode,
  type SplitNode,
  SplitView,
  serializeSplit,
  VBox,
} from "../src/index.ts";

// VSCode editor-grid model: a recursively splittable, drag-resizable pane grid.
// The root splits left/right; the right side splits top/bottom; the bottom-right
// splits again. Drag any divider to re-weight the panes around it.
// Pane body — a padded label. The pane's title bar is drawn by the flat Panel
// that SplitView wraps each leaf in (see the `title` field below).
const body = (text: string, color?: string) => (
  <Box style={{ padding: { left: 1, top: 1 } }}>
    <Label style={{ color }}>{text}</Label>
  </Box>
);

// Content for a pane id — used to rehydrate a persisted (content-less) tree.
const contentFor = (id: string) => body(`pane "${id}"`);

const defaultTree: SplitNode = {
  type: "split",
  direction: "row",
  sizes: [2, 3],
  children: [
    { type: "leaf", id: "editor", title: "main.ts", content: body("the primary editor pane") },
    {
      type: "split",
      direction: "column",
      sizes: [1, 1],
      children: [
        {
          type: "leaf",
          id: "preview",
          title: "Preview",
          content: body("rendered output", "$success"),
        },
        {
          type: "split",
          direction: "row",
          sizes: [1, 1],
          children: [
            { type: "leaf", id: "terminal", title: "Terminal", content: body("$ ls", "$primary") },
            {
              type: "leaf",
              id: "problems",
              title: "Problems",
              content: body("0 errors", "$warning"),
            },
          ],
        },
      ],
    },
  ],
};

// Persist the split structure (content-less) to a temp file and restore it,
// so the grid layout survives across runs.
const TREE_FILE = join(tmpdir(), "ztui-splitview-demo.json");
const saved: SerializedSplitNode | undefined = existsSync(TREE_FILE)
  ? JSON.parse(readFileSync(TREE_FILE, "utf-8"))
  : undefined;
const initialTree = saved ? hydrateSplit(saved, contentFor) : defaultTree;
const saveTree = (root: SplitNode) =>
  writeFileSync(TREE_FILE, JSON.stringify(serializeSplit(root), null, 2));

function SplitViewDemo() {
  return (
    <VBox style={{ width: "100%", height: "100%", background: "#11111b" }}>
      <Header>
        🪟 ZTUI SplitView — drag dividers · ↔/↕ split · ✕ close · layout persists · Ctrl+C quit
      </Header>
      <Box style={{ width: "100%", height: "1fr", padding: 1 }}>
        <SplitView
          root={initialTree}
          controls
          newPane={(id) => body(`split from ${id}`)}
          onChange={saveTree}
        />
      </Box>
    </VBox>
  );
}

const app = new App();
render(<SplitViewDemo />, app.activeScreen);
app.run();
