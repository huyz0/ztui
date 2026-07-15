import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import type { ListItem } from "../../core.ts";
import { ListView } from "../../react.ts";
import { mountApp } from "../../test/harness.tsx";
import type { ListViewWidget } from "./list-view.ts";

const fruits: ListItem[] = [
  { id: "apple", label: "Apple", icon: "🍎" },
  { id: "banana", label: "Banana", detail: "ripe" },
  { id: "cherry", label: "Cherry", disabled: true },
  { id: "date", label: "Date" },
];

function bigList(n: number): ListItem[] {
  return Array.from({ length: n }, (_, i) => ({ id: `i${i}`, label: `item-${i}` }));
}

function findList(t: Awaited<ReturnType<typeof mountApp>>): ListViewWidget {
  let found: ListViewWidget | undefined;
  t.screen.walk((n: any) => {
    if (n.constructor?.name === "ListViewWidget") found = n as ListViewWidget;
  });
  if (!found) throw new Error("ListViewWidget not found");
  return found;
}

describe("ListView rendering", () => {
  test("renders items with icon and dimmed detail", async () => {
    const t = await mountApp(<ListView items={fruits} style={{ height: "100%" }} />);
    const txt = t.text();
    expect(txt).toContain("🍎 Apple");
    expect(txt).toContain("Banana  ripe");
    expect(txt).toContain("Cherry");
  });

  test("virtualizes: only viewport rows are drawn, scrollbar appears", async () => {
    const t = await mountApp(<ListView items={bigList(500)} style={{ height: "100%" }} />, {
      rows: 10,
    });
    const txt = t.text();
    expect(txt).toContain("item-0");
    expect(txt).not.toContain("item-100");
    expect(txt).toContain("█"); // scrollbar thumb
    // The track is a solid dimmed background (a space), not a `░` shade glyph
    // (which renders unevenly across terminal fonts).
    expect(txt).not.toContain("░");
    const list = findList(t);
    const content = (list as any).getContentRect();
    const trackCell = t.cellAt(content.right - 1, content.bottom - 1); // track, below the thumb
    expect(trackCell.char).toBe(" ");
    expect(trackCell.style.background).toBeTruthy();
    expect(trackCell.style.background).not.toBe("default");
  });

  test("selected row gets the selection background", async () => {
    const t = await mountApp(
      <ListView items={fruits} selectedId="apple" style={{ height: "100%" }} />,
    );
    const list = findList(t);
    await t.settle();
    const content = (list as any).getContentRect();
    expect(t.cellAt(content.x, content.y).style.background).toBe("#264f78"); // resolved $selectionBg
  });
});

describe("ListView grouping", () => {
  test("swapping to a wholly new groups dataset re-seeds its own collapsed flags", async () => {
    // Regression: ensureCollapsedSeeded() only ever ran once (gated on a
    // plain boolean), so assigning a completely different `groups` array
    // later (a different tab, fresh search results, ...) had its own
    // `collapsed: true` flags silently ignored -- the new dataset's group
    // rendered expanded even though the caller explicitly asked for it to
    // start collapsed.
    const groupsA = [
      { id: "a", title: "Group A", collapsed: true, items: [{ id: "a1", label: "a1" }] },
    ];
    const groupsX = [
      { id: "x", title: "Group X", collapsed: true, items: [{ id: "x1", label: "x1" }] },
    ];
    let setGroups!: (g: typeof groupsA) => void;
    function Host() {
      const [groups, setter] = useState(groupsA);
      setGroups = setter;
      return <ListView groups={groups} style={{ height: "100%" }} />;
    }

    const t = await mountApp(<Host />);
    await t.settle();
    expect(t.text()).not.toContain("a1"); // starts collapsed

    setGroups(groupsX);
    await t.settle();
    expect(t.text()).not.toContain("x1"); // the *new* dataset's own collapsed:true is honored
  });
});

describe("ListView keyboard navigation", () => {
  test("arrow keys move selection and fire onSelect, skipping disabled rows", async () => {
    const onSelect = vi.fn();
    const t = await mountApp(
      <ListView items={fruits} onSelect={onSelect} style={{ height: "100%" }} />,
    );
    const list = findList(t);
    list.handleKey({ name: "down" } as any); // -> apple
    expect(list.selectedId).toBe("apple");
    list.handleKey({ name: "down" } as any); // -> banana
    list.handleKey({ name: "down" } as any); // cherry disabled -> date
    expect(list.selectedId).toBe("date");
    expect(onSelect).toHaveBeenCalledTimes(3);
    list.handleKey({ name: "up" } as any); // skips cherry back to banana
    expect(list.selectedId).toBe("banana");
  });

  test("home/end/pagedown clamp to bounds and keep selection visible", async () => {
    const t = await mountApp(<ListView items={bigList(100)} style={{ height: "100%" }} />, {
      rows: 10,
    });
    const list = findList(t);
    list.handleKey({ name: "end" } as any);
    expect(list.selectedId).toBe("i99");
    await t.settle();
    expect(t.text()).toContain("item-99");
    list.handleKey({ name: "home" } as any);
    expect(list.selectedId).toBe("i0");
    list.handleKey({ name: "pagedown" } as any);
    expect(list.selectedId).not.toBe("i0");
  });

  test("enter/space activate the selected item", async () => {
    const onActivate = vi.fn();
    const t = await mountApp(
      <ListView items={fruits} selectedId="apple" onActivate={onActivate} />,
    );
    const list = findList(t);
    list.handleKey({ name: "enter" } as any);
    list.handleKey({ name: "space" } as any);
    expect(onActivate).toHaveBeenCalledTimes(2);
    expect(onActivate.mock.calls[0][0].id).toBe("apple");
  });
});

describe("ListView mouse", () => {
  test("click selects; click on disabled row is a no-op; double-click activates", async () => {
    const onSelect = vi.fn();
    const onActivate = vi.fn();
    const t = await mountApp(
      <ListView
        items={fruits}
        onSelect={onSelect}
        onActivate={onActivate}
        style={{ height: "100%" }}
      />,
    );
    const list = findList(t);
    const content = (list as any).getContentRect();

    list.handleMouse({ type: "press", button: "left", x: content.x, y: content.y + 1 } as any);
    expect(list.selectedId).toBe("banana");
    expect(onSelect).toHaveBeenCalledTimes(1);

    list.handleMouse({ type: "press", button: "left", x: content.x, y: content.y + 2 } as any);
    expect(list.selectedId).toBe("banana"); // cherry is disabled

    list.handleMouse({ type: "press", button: "left", x: content.x, y: content.y + 3 } as any);
    list.handleMouse({ type: "press", button: "left", x: content.x, y: content.y + 3 } as any);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0][0].id).toBe("date");
  });

  test("wheel scrolls the viewport without changing selection", async () => {
    const t = await mountApp(<ListView items={bigList(100)} style={{ height: "100%" }} />, {
      rows: 10,
    });
    const list = findList(t);
    list.handleScroll({ type: "scroll_down" } as any);
    list.handleScroll({ type: "scroll_down" } as any);
    await t.settle();
    expect(t.text()).toContain("item-2");
    expect(t.text()).not.toContain("item-0 ");
    expect(list.selectedId).toBeNull();
  });

  test("dragging the scrollbar jumps the viewport; release ends the drag", async () => {
    const t = await mountApp(<ListView items={bigList(100)} style={{ height: "100%" }} />, {
      rows: 10,
    });
    const list = findList(t);
    const c = list.getContentRect();
    const sbX = c.right - 1;

    list.handleMouse({ type: "press", button: "left", x: sbX, y: c.bottom - 1, handled: false });
    await t.settle();
    expect(t.text()).not.toContain("item-0 ");

    list.handleMouse({ type: "drag", x: sbX, y: c.y, handled: false });
    await t.settle();
    expect(t.text()).toContain("item-0");

    // Release ends the drag; a later stray drag must not move the viewport.
    list.handleMouse({ type: "release", x: sbX, y: c.y, handled: false });
    const after = t.text();
    list.handleMouse({ type: "drag", x: sbX, y: c.bottom - 1, handled: false });
    await t.settle();
    expect(t.text()).toBe(after);
  });

  test("a press in the body margin (below all rows) selects nothing", async () => {
    const t = await mountApp(<ListView items={fruits} style={{ height: "100%" }} />, { rows: 20 });
    const list = findList(t);
    const c = list.getContentRect();
    // Click well below the last row.
    list.handleMouse({ type: "press", button: "left", x: c.x, y: c.bottom - 1, handled: false });
    expect(list.selectedId).toBeNull();
  });

  test("scrolling a wide row out of view doesn't snap horizontal scroll back", async () => {
    // Regression: the horizontal scroll bound was recomputed from only the
    // rows visible *this frame*, so scrolling the one very wide row out of
    // the viewport shrank the bound (based on the remaining, narrower rows)
    // and clamped scrollLeft back toward 0 -- even though the user never
    // scrolled left, and the wide row is still part of the same dataset.
    const wideItems: ListItem[] = [{ id: "wide", label: "w".repeat(200) }, ...bigList(50)];
    const t = await mountApp(<ListView items={wideItems} style={{ height: "100%" }} />, {
      rows: 5,
    });
    const list = findList(t);
    await t.settle();
    // With the wide row visible, scroll right (past what the narrow rows
    // alone would ever allow).
    (list as unknown as { scrollLeft: number }).scrollLeft = 100;
    await t.settle();
    const scrollLeftAfterSet = (list as unknown as { scrollLeft: number }).scrollLeft;
    expect(scrollLeftAfterSet).toBeGreaterThan(0);

    // Scroll down far enough that the wide row is no longer in the viewport.
    for (let i = 0; i < 10; i++) list.handleScroll({ type: "scroll_down" } as any);
    await t.settle();

    expect((list as unknown as { scrollLeft: number }).scrollLeft).toBe(scrollLeftAfterSet);
  });
});
