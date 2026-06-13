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
});
