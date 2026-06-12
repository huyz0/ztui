import { App, Box, Header, Label, render, type SplitNode, SplitView, VBox } from "../src/index.ts";

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

const tree: SplitNode = {
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

function SplitViewDemo() {
  return (
    <VBox style={{ width: "100%", height: "100%", background: "#11111b" }}>
      <Header>🪟 ZTUI SplitView — drag dividers · ↔/↕ split a pane · ✕ close · Ctrl+C quit</Header>
      <Box style={{ width: "100%", height: "100%", padding: 1 }}>
        <SplitView root={tree} controls newPane={(id) => pane("untitled", `split from ${id}`)} />
      </Box>
    </VBox>
  );
}

const app = new App();
render(<SplitViewDemo />, app.activeScreen);
app.run();
