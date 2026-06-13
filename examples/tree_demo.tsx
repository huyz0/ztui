import { useState } from "react";
import type { TreeNode } from "../src/core.ts";
import { Dock, Footer, Header, Tree } from "../src/react.ts";
import { quitHint } from "./exit-button.tsx";

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
        ↑/↓ move · →/← expand · Enter/dbl-click open{quitHint()} ·{" "}
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

import type { Demo } from "./gallery/types.ts";

export const treeDemo: Demo = {
  id: "tree",
  title: "Tree",
  group: "Data",
  description: "Virtualized navigation tree.",
  autoFocusTag: "tree",
  Component: TreeDemo,
};
