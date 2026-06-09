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

  return (
    <Dock style={{ background: "#11111b" }}>
      <Header>🗂️ ZTUI Tree — workspace navigation (virtualized)</Header>
      <Footer>
        ↑/↓ move · →/← expand/collapse · Enter toggle · Ctrl+C quit ·{" "}
        {selected ? `selected: ${selected}` : "nothing selected"}
      </Footer>

      <Tree
        style={{ padding: 1 }}
        data={workspace}
        expanded={expanded}
        onExpandedChange={setExpanded}
        onSelect={(node) => setSelected(node.id)}
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
