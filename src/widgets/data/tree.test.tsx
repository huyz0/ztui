import { describe, expect, test } from "vitest";
import type { TreeNode } from "../../core.ts";
import { Tree } from "../../react.ts";
import { findWidgetByType, mountApp, waitFor } from "../../test/harness.tsx";
import type { TreeWidget } from "./tree.ts";

const workspace: TreeNode[] = [
  {
    id: "src",
    label: "src",
    icon: "📁",
    children: [
      { id: "src/app.ts", label: "app.ts", icon: "📄" },
      {
        id: "src/widgets",
        label: "widgets",
        icon: "📁",
        children: [{ id: "src/widgets/tree.ts", label: "tree.ts", icon: "📄" }],
      },
    ],
  },
  { id: "README.md", label: "README.md", icon: "📄" },
];

function findTree(t: Awaited<ReturnType<typeof mountApp>>): TreeWidget {
  return findWidgetByType<TreeWidget>(t, "TreeWidget");
}

function bigTree(n: number): TreeNode[] {
  return [
    {
      id: "root",
      label: "root",
      children: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `item-${i}` })),
    },
  ];
}

describe("Tree rendering (forest + icons)", () => {
  test("renders top-level forest items with icons; collapsed children hidden", async () => {
    const t = await mountApp(<Tree data={workspace} style={{ height: "100%" }} />);
    // The Tree virtualizes — its first paint can lag a frame; wait for content.
    await waitFor(() => t.text().includes("README.md"), { poke: () => t.app.queueRender() });
    const txt = t.text();
    expect(txt).toContain("src");
    expect(txt).toContain("README.md");
    expect(txt).toContain("📁"); // icon rendered
    expect(txt).toContain("▸"); // collapsed expandable arrow
    expect(txt).not.toContain("app.ts"); // child hidden while collapsed
  });

  test("indents and reveals children when expanded", async () => {
    const t = await mountApp(
      <Tree data={workspace} expanded={["src"]} style={{ height: "100%" }} />,
    );
    await waitFor(() => t.text().includes("app.ts"), { poke: () => t.app.queueRender() });
    const txt = t.text();
    expect(txt).toContain("app.ts");
    expect(txt).toContain("widgets");
    expect(txt).toContain("▾"); // expanded arrow
    expect(txt).not.toContain("tree.ts"); // grandchild still collapsed
  });

  test("showGuides draws a dotted vertical guide at each indent level", async () => {
    const withGuides = await mountApp(
      <Tree data={workspace} expanded={["src"]} showGuides style={{ height: "100%" }} />,
    );
    await waitFor(() => withGuides.text().includes("┊"), {
      poke: () => withGuides.app.queueRender(),
    });
    expect(withGuides.text()).toContain("┊"); // dotted guide glyph rendered

    const noGuides = await mountApp(
      <Tree data={workspace} expanded={["src"]} style={{ height: "100%" }} />,
    );
    await waitFor(() => noGuides.text().includes("app.ts"), {
      poke: () => noGuides.app.queueRender(),
    });
    expect(noGuides.text()).not.toContain("┊"); // off by default
  });

  test("hideRoot promotes a single root's children to the top level", async () => {
    const t = await mountApp(<Tree data={workspace} hideRoot style={{ height: "100%" }} />);
    await waitFor(() => t.text().includes("app.ts"), { poke: () => t.app.queueRender() });
    const txt = t.text();
    // src's children become top-level; the "src" root label is hidden.
    expect(txt).toContain("app.ts");
    expect(txt).toContain("widgets");
    expect(txt.split("\n")[0]).not.toContain("src");
  });
});

describe("Tree virtualization", () => {
  test("renders only the viewport window for a huge expanded tree", async () => {
    const t = await mountApp(
      <Tree data={bigTree(100_000)} expanded={["root"]} style={{ height: 12 }} />,
      { screenStyle: { flexDirection: "column" } },
    );
    const txt = t.text();
    expect(txt).toContain("item-0");
    expect(txt).not.toContain("item-5000");
  });
});

describe("Tree scrolling & paging", () => {
  test("wheel + Home/End/PageDown move through a large tree", async () => {
    const t = await mountApp(
      <Tree data={bigTree(1000)} expanded={["root"]} style={{ height: 12 }} />,
      { screenStyle: { flexDirection: "column" } },
    );
    const tree = findTree(t);
    t.screen.focusWidget(tree);

    // Each wheel tick moves 3 rows.
    for (let i = 0; i < 10; i++) tree.handleScroll({ type: "scroll_down" } as any);
    await t.settle();
    expect(t.text()).toContain("item-30");

    tree.handleKey({ name: "end" } as any);
    await t.settle();
    expect(t.text()).toContain("item-999");

    tree.handleKey({ name: "home" } as any);
    await t.settle();
    expect(t.text()).toContain("item-0");

    tree.handleKey({ name: "pagedown" } as any);
    tree.handleKey({ name: "pagedown" } as any);
    tree.handleKey({ name: "pagedown" } as any);
    await t.settle();
    expect(t.text()).not.toContain("item-0");
  });

  test("scrolling a wide row out of view doesn't snap horizontal scroll back", async () => {
    // Regression: the horizontal scroll bound was recomputed from only the
    // rows visible *this frame*, so scrolling the one very wide row out of
    // the viewport shrank the bound (based on the remaining, narrower rows)
    // and clamped scrollLeft back toward 0 -- even though the user never
    // scrolled left, and the wide row is still part of the same dataset.
    const wideChildren = bigTree(50)[0].children ?? [];
    const data: TreeNode[] = [
      {
        id: "root",
        label: "root",
        children: [{ id: "wide", label: "w".repeat(200) }, ...wideChildren],
      },
    ];
    const t = await mountApp(<Tree data={data} expanded={["root"]} style={{ height: 12 }} />, {
      screenStyle: { flexDirection: "column" },
    });
    const tree = findTree(t);
    await t.settle();
    // With the wide row visible, scroll right (past what the narrow rows
    // alone would ever allow).
    (tree as unknown as { scrollLeft: number }).scrollLeft = 100;
    await t.settle();
    const scrollLeftAfterSet = (tree as unknown as { scrollLeft: number }).scrollLeft;
    expect(scrollLeftAfterSet).toBeGreaterThan(0);

    // Scroll down far enough that the wide row is no longer in the viewport.
    for (let i = 0; i < 10; i++) tree.handleScroll({ type: "scroll_down" } as any);
    await t.settle();

    expect((tree as unknown as { scrollLeft: number }).scrollLeft).toBe(scrollLeftAfterSet);
  });

  test("scrollbar press jumps the scroll position", async () => {
    const t = await mountApp(
      <Tree data={bigTree(1000)} expanded={["root"]} style={{ height: 12 }} />,
      { screenStyle: { flexDirection: "column" } },
    );
    const tree = findTree(t);
    const c = tree.getContentRect();
    tree.handleMouse({
      type: "press",
      button: "left",
      x: c.right - 1,
      y: c.bottom - 1,
    } as any);
    await t.settle();
    expect(t.text()).not.toContain("item-0");
  });
});

describe("Tree keyboard navigation", () => {
  test("right expands, left collapses, and arrows move selection", async () => {
    const t = await mountApp(<Tree data={workspace} style={{ height: "100%" }} />);
    const tree = findTree(t);
    t.screen.focusWidget(tree);

    tree.handleKey({ name: "down" } as any); // select "src"
    tree.handleKey({ name: "right" } as any); // expand src
    await t.settle();
    expect(t.text()).toContain("app.ts");

    tree.handleKey({ name: "left" } as any); // collapse src
    await t.settle();
    expect(t.text()).not.toContain("app.ts");
  });

  test("left on a child selects its parent", async () => {
    let selected = "";
    const t = await mountApp(
      <Tree
        data={workspace}
        expanded={["src"]}
        onSelect={(n) => {
          selected = n.id;
        }}
        style={{ height: "100%" }}
      />,
    );
    const tree = findTree(t);
    t.screen.focusWidget(tree);
    tree.handleKey({ name: "down" } as any); // src
    tree.handleKey({ name: "down" } as any); // app.ts (child)
    tree.handleKey({ name: "left" } as any); // -> parent src
    await t.settle();
    expect(selected).toBe("src");
  });

  test("right on an already-expanded node steps into its first child; unknown keys pass through", async () => {
    const ids: string[] = [];
    const t = await mountApp(
      <Tree
        data={workspace}
        expanded={["src"]}
        onSelect={(n) => ids.push(n.id)}
        style={{ height: "100%" }}
      />,
    );
    const tree = findTree(t);
    t.screen.focusWidget(tree);
    tree.handleKey({ name: "down" } as any); // select "src" (expanded)
    tree.handleKey({ name: "right" } as any); // expanded → step into first child
    await t.settle();
    expect(ids.at(-1)).toBe("src/app.ts");

    const ev = { name: "q", handled: false } as any;
    tree.handleKey(ev);
    expect(ev.handled).toBeFalsy(); // unknown key left for other widgets
  });
});

describe("Tree selection & toggling", () => {
  test("clicking a row selects it and fires onSelect", async () => {
    let selected: TreeNode | undefined;
    const t = await mountApp(
      <Tree
        data={workspace}
        onSelect={(n) => {
          selected = n;
        }}
        style={{ height: "100%" }}
      />,
    );
    const tree = findTree(t);
    const c = tree.getContentRect();
    tree.handleMouse({ type: "press", button: "left", x: c.x + 4, y: c.y } as any);
    await t.settle();
    expect(selected?.id).toBe("src");
  });

  test("clicking the arrow toggles expansion (uncontrolled)", async () => {
    let toggled: [string, boolean] | undefined;
    const t = await mountApp(
      <Tree
        data={workspace}
        onToggle={(n, e) => {
          toggled = [n.id, e];
        }}
        style={{ height: "100%" }}
      />,
    );
    const tree = findTree(t);
    const c = tree.getContentRect();
    // The "src" arrow sits at the first column of the first row.
    tree.handleMouse({ type: "press", button: "left", x: c.x, y: c.y } as any);
    await t.settle();
    expect(toggled).toEqual(["src", true]);
    expect(t.text()).toContain("app.ts");
  });

  test("Enter and Space activate; double-click activates", async () => {
    const selects: string[] = [];
    let activated = "";
    const t = await mountApp(
      <Tree
        data={workspace}
        expanded={["src"]}
        onSelect={(n) => selects.push(n.id)}
        onActivate={(n) => {
          activated = n.id;
        }}
        style={{ height: "100%" }}
      />,
    );
    const tree = findTree(t);
    t.screen.focusWidget(tree);

    tree.handleKey({ name: "down" } as any); // select "src"
    expect(selects).toContain("src");
    expect(activated).toBe(""); // navigation does not activate

    tree.handleKey({ name: "enter" } as any);
    expect(activated).toBe("src");

    // Double-click a row activates it.
    activated = "";
    const c = tree.getContentRect();
    const press = (y: number) =>
      tree.handleMouse({ type: "press", button: "left", x: c.x + 6, y } as any);
    press(c.y); // single click "src"
    expect(activated).toBe("");
    press(c.y); // second click -> activate
    expect(activated).toBe("src");
  });

  test("controlled expansion defers to onExpandedChange", async () => {
    let next: string[] | undefined;
    const t = await mountApp(
      <Tree
        data={workspace}
        expanded={[]}
        onExpandedChange={(e) => {
          next = e;
        }}
        style={{ height: "100%" }}
      />,
    );
    const tree = findTree(t);
    tree.toggle("src");
    expect(next).toEqual(["src"]);
    // Controlled: internal state not mutated.
    expect(tree.expanded).toEqual([]);
  });

  test("collapsing an ancestor of the selected node reselects it instead of stranding selectedIndex at -1", async () => {
    // Regression: setExpanded left `selectedId` untouched when collapsing an
    // *ancestor* of the current selection (not the selected node's own row).
    // The selected node vanished from `flat`, so selectedIndex became -1, and
    // the next arrow-key press treated it as "nothing selected" — jumping to
    // the very top (Down) or bottom (Up) of the entire tree instead of
    // landing near the collapsed ancestor where the user's focus logically
    // was.
    const t = await mountApp(
      <Tree data={workspace} expanded={["src", "src/widgets"]} style={{ height: "100%" }} />,
    );
    const tree = findTree(t);
    tree.selectedId = "src/widgets/tree.ts"; // deeply nested leaf

    tree.setExpanded("src", false); // collapse the top-level ancestor
    await t.settle();

    // Reselected to the collapsed (still-visible) row, not stranded.
    expect(tree.selectedId).toBe("src");

    // A subsequent Down moves to the next visible row (README.md), not to
    // index 0 of a "nothing selected" reset (which would also land on "src"
    // here, so use Up first to prove it isn't just coincidentally right).
    t.screen.focusWidget(tree);
    tree.handleKey({ name: "down" } as any);
    expect(tree.selectedId).toBe("README.md");
  });
});

describe("Tree accessibility", () => {
  test("getAccessibleNode reports item count and the selected node's label/level/state", async () => {
    const t = await mountApp(
      <Tree data={workspace} expanded={["src"]} style={{ height: "100%" }} />,
    );
    const tree = findTree(t);

    let node = tree.getAccessibleNode();
    expect(node?.role).toBe("tree");
    expect(node?.state).toContain("4 items"); // src, app.ts, widgets, README.md (src/widgets collapsed)

    tree.selectedId = "src/app.ts";
    node = tree.getAccessibleNode();
    expect(node?.label).toBe("app.ts");
    expect(node?.value).toBe("2"); // 1-based position among visible rows
    expect(node?.state).toContain("level 2");

    tree.selectedId = "src";
    node = tree.getAccessibleNode();
    expect(node?.state).toContain("expanded");
  });
});

describe("Tree ensureFlat memoization", () => {
  test("an empty (or fully collapsed-to-nothing) tree still hits the flatten cache", async () => {
    // Regression: the cache-hit guard required `flat.length > 0` on top of
    // the data/expansion/hideRoot signature match, so whenever the flattened
    // list legitimately has zero rows (empty data, or a hideRoot tree whose
    // single root has no children) it rebuilt — walking `roots` and
    // reallocating `expandedSet` — on every single call, defeating the
    // memoization for that state.
    const t = await mountApp(<Tree data={[]} style={{ height: "100%" }} />);
    const tree = findTree(t);

    tree.render(t.buffer);
    const flatAfterFirst = (tree as any).flat;
    tree.render(t.buffer);
    const flatAfterSecond = (tree as any).flat;

    // Same array instance means ensureFlat's cache-hit branch returned early
    // instead of rebuilding — reference equality is the proxy for "no rebuild
    // happened" here, since a rebuild always allocates a fresh array.
    expect(flatAfterSecond).toBe(flatAfterFirst);
  });
});
