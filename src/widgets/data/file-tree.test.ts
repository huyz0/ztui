import { describe, expect, test } from "vitest";
import { buildFileTree, type FileEntry, iconForEntry } from "./file-tree.ts";

describe("iconForEntry", () => {
  test("directories always get the folder icon", () => {
    expect(iconForEntry("src", true)).toBe("📁");
    expect(iconForEntry("node_modules", true)).toBe("📁");
  });

  test("resolves by exact filename before extension", () => {
    expect(iconForEntry("package.json", false)).toBe("📦");
    expect(iconForEntry("random.json", false)).toBe("🔧");
  });

  test("resolves multi-part extensions (e.g. .test.ts) more specifically than the bare extension", () => {
    expect(iconForEntry("widget.test.ts", false)).toBe("🧪");
    expect(iconForEntry("widget.ts", false)).toBe("📘");
  });

  test("dotfiles without a known name/extension get a generic config icon", () => {
    expect(iconForEntry(".prettierrc", false)).toBe("⚙️");
  });

  test("unknown files fall back to a generic file icon", () => {
    expect(iconForEntry("mystery.xyz", false)).toBe("📄");
  });
});

describe("buildFileTree", () => {
  test("maps entries to TreeNodes with path-derived ids and icons", () => {
    const entries: FileEntry[] = [
      { name: "src", isDirectory: true, children: [{ name: "index.ts", isDirectory: false }] },
      { name: "README.md", isDirectory: false },
    ];
    const nodes = buildFileTree(entries);

    // Directories sort before files.
    expect(nodes[0].label).toBe("src");
    expect(nodes[0].id).toBe("src");
    expect(nodes[0].icon).toBe("📁");
    expect(nodes[0].expandable).toBe(true);
    expect(nodes[0].children?.[0].id).toBe("src/index.ts");
    expect(nodes[0].children?.[0].icon).toBe("📘");

    expect(nodes[1].label).toBe("README.md");
    expect(nodes[1].id).toBe("README.md");
    expect(nodes[1].expandable).toBe(false);
  });

  test("sorts directories before files, then alphabetically", () => {
    const entries: FileEntry[] = [
      { name: "zeta.ts", isDirectory: false },
      { name: "beta", isDirectory: true },
      { name: "alpha.ts", isDirectory: false },
      { name: "gamma", isDirectory: true },
    ];
    const labels = buildFileTree(entries).map((n) => n.label);
    expect(labels).toEqual(["beta", "gamma", "alpha.ts", "zeta.ts"]);
  });

  test("an unloaded directory (no children, no hasChildren) defaults to expandable", () => {
    const nodes = buildFileTree([{ name: "lazy-dir", isDirectory: true }]);
    expect(nodes[0].expandable).toBe(true);
    expect(nodes[0].children).toBeUndefined();
  });

  test("hasChildren: false overrides the optimistic default for an empty lazy directory", () => {
    const nodes = buildFileTree([{ name: "empty-dir", isDirectory: true, hasChildren: false }]);
    expect(nodes[0].expandable).toBe(false);
  });

  test("a loaded directory with no children is not expandable", () => {
    const nodes = buildFileTree([{ name: "empty-dir", isDirectory: true, children: [] }]);
    expect(nodes[0].expandable).toBe(false);
  });

  test("nested paths accumulate with basePath", () => {
    const entries: FileEntry[] = [
      {
        name: "a",
        isDirectory: true,
        children: [
          { name: "b", isDirectory: true, children: [{ name: "c.ts", isDirectory: false }] },
        ],
      },
    ];
    const nodes = buildFileTree(entries);
    expect(nodes[0].children?.[0].id).toBe("a/b");
    expect(nodes[0].children?.[0].children?.[0].id).toBe("a/b/c.ts");
  });
});
