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
function pane(title: string, body: string, color?: string) {
  return (
    <Box title={title} style={{ width: "100%", height: "100%", border: "rounded", padding: 1 }}>
      <Label style={{ color }}>{body}</Label>
    </Box>
  );
}

// Content for a pane id — used to rehydrate a persisted (content-less) tree.
const contentFor = (id: string) => pane(id, `pane "${id}"`);

const defaultTree: SplitNode = {
  type: "split",
  direction: "row",
  sizes: [2, 3],
  children: [
    { type: "leaf", id: "editor", content: pane("main.ts", "the primary editor pane") },
    {
      type: "split",
      direction: "column",
      sizes: [1, 1],
      children: [
        { type: "leaf", id: "preview", content: pane("Preview", "rendered output", "$success") },
        {
          type: "split",
          direction: "row",
          sizes: [1, 1],
          children: [
            { type: "leaf", id: "terminal", content: pane("Terminal", "$ ls", "$primary") },
            { type: "leaf", id: "problems", content: pane("Problems", "0 errors", "$warning") },
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
      <Box style={{ width: "100%", height: "100%", padding: 1 }}>
        <SplitView
          root={initialTree}
          controls
          newPane={(id) => pane("untitled", `split from ${id}`)}
          onChange={saveTree}
        />
      </Box>
    </VBox>
  );
}

const app = new App();
render(<SplitViewDemo />, app.activeScreen);
app.run();
