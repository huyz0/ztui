import { useState } from "react";
import type { Widget } from "../src/dom/widget.ts";
import { App, Dock, Footer, Header, render, Tree, type TreeNode } from "../src/index.ts";

// A workspace tree. `data` is a forest (no synthetic root needed); a deep
// folder is generated to show virtualization + scrolling.
const workspace: TreeNode[] = [
  {
    id: "src",
    label: "src",
    icon: "📁",
    children: [
      { id: "src/index.ts", label: "index.ts", icon: "📄" },
      {
        id: "src/widgets",
        label: "widgets",
        icon: "📁",
        children: [
          { id: "src/widgets/tree.ts", label: "tree.ts", icon: "📄" },
          { id: "src/widgets/table.ts", label: "table.ts", icon: "📄" },
        ],
      },
      {
        id: "src/generated",
        label: "generated (5000 files)",
        icon: "📁",
        children: Array.from({ length: 5000 }, (_, i) => ({
          id: `gen/${i}`,
          label: `module_${String(i).padStart(4, "0")}.ts`,
          icon: "📄",
        })),
      },
    ],
  },
  { id: "package.json", label: "package.json", icon: "📄" },
  { id: "README.md", label: "README.md", icon: "📄" },
];

function TreeDemo() {
  const [expanded, setExpanded] = useState<string[]>(["src"]);
  const [selected, setSelected] = useState<string>("");
  const [opened, setOpened] = useState<string>("");

  return (
    <Dock style={{ background: "$surface" }}>
      <Header>🗂️ ZTUI Tree — workspace navigation (virtualized)</Header>
      <Footer>
        ↑/↓ move · →/← expand · Enter/dbl-click open · Ctrl+C quit ·{" "}
        {selected ? `sel: ${selected}` : "—"}
        {opened ? ` · opened: ${opened}` : ""}
      </Footer>

      <Tree
        style={{ padding: 1 }}
        data={workspace}
        showGuides
        expanded={expanded}
        onExpandedChange={setExpanded}
        onSelect={(node) => setSelected(node.id)}
        onActivate={(node) => setOpened(node.id)}
      />
    </Dock>
  );
}

const app = new App();
render(<TreeDemo />, app.activeScreen);
app.run();

// Auto-focus the tree so the keyboard drives it without a Tab first.
const focusTree = () => {
  let tree: Widget | null = null;
  app.activeScreen.walk((node) => {
    if ((node as Widget).tagName === "tree") tree = node as Widget;
  });
  if (tree) app.activeScreen.focusWidget(tree);
  else setTimeout(focusTree, 10);
};
focusTree();
