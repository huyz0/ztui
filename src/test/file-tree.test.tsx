import { describe, expect, test } from "vitest";
import { buildFileTree, type FileEntry } from "../core.ts";
import { Tree } from "../react.ts";
import { mountApp } from "./harness.tsx";

describe("Tree + buildFileTree", () => {
  test("renders an iconified file tree and expands a lazy directory on toggle", async () => {
    const entries: FileEntry[] = [
      {
        name: "src",
        isDirectory: true,
        children: [
          { name: "index.ts", isDirectory: false },
          { name: "widget.test.ts", isDirectory: false },
        ],
      },
      { name: "docs", isDirectory: true, hasChildren: true }, // lazy, unloaded
      { name: "README.md", isDirectory: false },
    ];

    let toggledNode: string | null = null;
    const { findById, settle, text } = await mountApp(
      <Tree
        id="ft"
        data={buildFileTree(entries)}
        expanded={["src"]}
        onToggle={(node, expanded) => {
          if (expanded) toggledNode = node.id;
        }}
      />,
      { cols: 40, rows: 15 },
    );

    const tree = findById("ft");
    await settle();

    // src is expanded (via the `expanded` prop), so its children render as rows.
    expect(text()).toContain("index.ts");
    expect(text()).toContain("widget.test.ts");
    expect(text()).toContain("📁");
    expect(text()).toContain("docs");
    expect(text()).toContain("README.md");

    // docs is a lazy directory (no loaded children); it still shows an expand
    // arrow so the user can trigger onToggle to fetch its real children.
    tree.toggle("docs");
    expect(toggledNode).toBe("docs");
    expect(tree.expanded).toContain("docs");
  });
});
