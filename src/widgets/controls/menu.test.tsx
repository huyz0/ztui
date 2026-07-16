import { useEffect } from "react";
import { describe, expect, test } from "vitest";
import { Offset } from "../../geometry/offset.ts";
import { Region } from "../../geometry/region.ts";
import { Size } from "../../geometry/size.ts";
import { Box, ContextMenu, Label, useContextMenu, VBox } from "../../react.ts";
import { ScreenBuffer } from "../../render/buffer.ts";
import { mountApp } from "../../test/harness.tsx";
import { type MenuItem, MenuListWidget } from "./menu.ts";

const key = (name: string) => ({ key: name, name, ctrl: false, shift: false, meta: false }) as any;
const mouse = (x: number, y: number, type: any, button = "left") => ({ x, y, type, button }) as any;

function menu(items: MenuItem[]): MenuListWidget {
  const w = new MenuListWidget();
  w.items = items;
  // The app's style pass resolves computedStyle from defaultStyle before
  // measure/layout; seed it here so border/padding geometry matches in-app.
  w.computedStyle = { ...w.defaultStyle };
  // A concrete region so getContentRect maps mouse rows during unit tests.
  w.region = new Region(new Offset(0, 0), new Size(24, items.length + 2));
  return w;
}

describe("MenuListWidget keyboard navigation", () => {
  const items: MenuItem[] = [
    { label: "Cut" },
    { separator: true },
    { label: "Paste", disabled: true },
    { label: "Delete", danger: true },
  ];

  test("highlight starts on the first selectable row", () => {
    expect(menu(items).highlightedIndex).toBe(0);
  });

  test("down/up skip separators and disabled rows, and wrap", () => {
    const w = menu(items);
    w.handleKey(key("down")); // 0 → 3 (skip separator @1, disabled @2)
    expect(w.highlightedIndex).toBe(3);
    w.handleKey(key("down")); // 3 → 0 (wrap)
    expect(w.highlightedIndex).toBe(0);
    w.handleKey(key("up")); // 0 → 3 (wrap back)
    expect(w.highlightedIndex).toBe(3);
  });

  test("wantsTab() reports true so Tab stays inside the menu", () => {
    expect(menu(items).wantsTab()).toBe(true);
  });

  test("tab/shift+tab move the highlight like down/up", () => {
    const w = menu(items);
    w.handleKey({ ...key("tab"), shift: false });
    expect(w.highlightedIndex).toBe(3); // 0 → 3, same as "down"
    w.handleKey({ ...key("tab"), shift: true });
    expect(w.highlightedIndex).toBe(0); // 3 → 0, same as "up"
  });

  test("home/end jump to the first/last selectable row", () => {
    const w = menu(items);
    w.handleKey(key("end"));
    expect(w.highlightedIndex).toBe(3);
    w.handleKey(key("home"));
    expect(w.highlightedIndex).toBe(0);
  });

  test("Enter and Space activate the highlighted row; nav keys are consumed", () => {
    const w = menu(items);
    const chosen: Array<[string, number]> = [];
    w.onSelect = (item, i) => chosen.push([item.label ?? "", i]);
    const ev = key("down");
    w.handleKey(ev);
    expect(ev.handled).toBe(true);
    w.handleKey(key("enter"));
    expect(chosen).toEqual([["Delete", 3]]);
    w.handleKey(key("space"));
    expect(chosen).toEqual([
      ["Delete", 3],
      ["Delete", 3],
    ]);
  });

  test("Escape is left unhandled so an overlay layer can close on it", () => {
    const ev = key("escape");
    menu(items).handleKey(ev);
    expect(ev.handled).toBeFalsy();
  });
});

describe("MenuListWidget items setter", () => {
  test("a non-array assignment is coerced to an empty list", () => {
    const w = menu([{ label: "One" }]);
    (w as any).items = "not an array";
    expect(w.items).toEqual([]);
  });

  test("re-assigning items keeps the highlight when it is still selectable", () => {
    const w = menu([{ label: "One" }, { label: "Two" }]);
    w.handleKey(key("down")); // highlight -> 1
    expect(w.highlightedIndex).toBe(1);
    w.items = [{ label: "One" }, { label: "Two" }, { label: "Three" }];
    expect(w.highlightedIndex).toBe(1); // still selectable, untouched
  });
});

describe("MenuListWidget.move with a single selectable row", () => {
  test("moving among all-disabled/separator rows besides one is a no-op", () => {
    const w = menu([{ label: "Only" }, { separator: true }, { label: "Skip", disabled: true }]);
    expect(w.highlightedIndex).toBe(0);
    w.handleKey(key("down"));
    // Wraps all the way back to the same (only selectable) row - no change.
    expect(w.highlightedIndex).toBe(0);
  });
});

describe("MenuListWidget.activate", () => {
  test("activating a row with a submenu opens it instead of firing onSelect", () => {
    const w = menu([{ label: "More", submenu: [{ label: "Sub" }] }]);
    let selected = false;
    w.onSelect = () => {
      selected = true;
    };
    // No screen attached: openSubmenu bails out after setting the highlight,
    // so onSelect must still not fire for a submenu row.
    w.activate(0);
    expect(selected).toBe(false);
  });
});

describe("MenuListWidget.handleKey edge cases", () => {
  test("falls back to ev.key when ev.name is absent", () => {
    const w = menu([{ label: "One" }, { label: "Two" }]);
    const ev = { key: "down", name: undefined, ctrl: false, shift: false, meta: false } as any;
    w.handleKey(ev);
    expect(w.highlightedIndex).toBe(1);
    expect(ev.handled).toBe(true);
  });

  test("Tab moves forward, Shift+Tab moves backward", () => {
    const w = menu([{ label: "One" }, { label: "Two" }, { label: "Three" }]);
    w.handleKey({ name: "tab", shift: false } as any);
    expect(w.highlightedIndex).toBe(1);
    w.handleKey({ name: "tab", shift: true } as any);
    expect(w.highlightedIndex).toBe(0);
  });
});

describe("MenuListWidget mouse", () => {
  const items: MenuItem[] = [{ label: "One" }, { separator: true }, { label: "Two" }];

  test("clicking a row activates it; clicking a separator does nothing", () => {
    const w = menu(items);
    const chosen: number[] = [];
    w.onSelect = (_i, idx) => chosen.push(idx);
    const rect = w.getContentRect();
    w.handleMouse(mouse(rect.x + 1, rect.y + 2, "press")); // row index 2 → "Two"
    expect(chosen).toEqual([2]);
    w.handleMouse(mouse(rect.x + 1, rect.y + 1, "press")); // separator row
    expect(chosen).toEqual([2]);
  });

  test("hover highlights a selectable row but not a disabled/separator row", () => {
    const w = menu([{ label: "One" }, { label: "Two", disabled: true }]);
    const rect = w.getContentRect();
    w.handleMouse(mouse(rect.x, rect.y + 1, "move")); // disabled row
    expect(w.highlightedIndex).toBe(0); // unchanged
  });

  test("a right-click press doesn't activate the row", () => {
    const w = menu([{ label: "One" }]);
    let selected = false;
    w.onSelect = () => {
      selected = true;
    };
    const rect = w.getContentRect();
    w.handleMouse(mouse(rect.x, rect.y, "press", "right"));
    expect(selected).toBe(false);
  });
});

describe("MenuListWidget.openSubmenu without a screen", () => {
  test("a detached widget's submenu open is a no-op (no screen to anchor to)", () => {
    const w = menu([{ label: "More", submenu: [{ label: "Sub" }] }]);
    // Never attached to a Screen, so getScreen() returns null.
    expect(() => w.activate(0)).not.toThrow();
    expect(w.highlightedIndex).toBe(0);
  });
});

describe("MenuListWidget render", () => {
  function render(items: MenuItem[], highlightedIndex = 0): ScreenBuffer {
    const w = menu(items);
    w.computedStyle = { ...w.defaultStyle };
    w.handleKey(key("home"));
    for (let i = 0; i < highlightedIndex; i++) w.handleKey(key("down"));
    const buffer = new ScreenBuffer(24, items.length + 2);
    w.render(buffer);
    return buffer;
  }

  test("renders a danger row, a plain shortcut row, and a submenu chevron", () => {
    const buf = render([
      { label: "Delete", danger: true },
      { label: "Save", shortcut: "Ctrl+S" },
      { label: "More", submenu: [{ label: "Sub" }] },
    ]);
    const rows = buf.cells.map((r) => r.map((c) => c.char).join(""));
    expect(rows.some((r) => r.includes("Delete"))).toBe(true);
    expect(rows.some((r) => r.includes("Ctrl+S"))).toBe(true);
    expect(rows.some((r) => r.includes("▸"))).toBe(true);
  });

  test("a row past the visible rect (overflowing region) is skipped, not drawn out of bounds", () => {
    const w = menu([{ label: "One" }, { label: "Two" }, { label: "Three" }]);
    w.computedStyle = { ...w.defaultStyle };
    // A buffer shorter than the item count clips the trailing rows.
    const buffer = new ScreenBuffer(24, 2);
    expect(() => w.render(buffer)).not.toThrow();
  });

  test("falls back to the resolved $foreground when computedStyle.color is unset", () => {
    const w = menu([{ label: "One" }]);
    w.computedStyle = {}; // no explicit color
    const buffer = new ScreenBuffer(24, 3);
    expect(() => w.render(buffer)).not.toThrow();
    const row = buffer.cells[0].map((c) => c.char).join("");
    expect(row).toContain("One");
  });
});

describe("MenuListWidget measure", () => {
  test("sizes to the widest row (icon + label + shortcut) plus border and padding", () => {
    const w = menu([{ label: "Copy", shortcut: "Ctrl+C" }, { label: "X" }]);
    w.measure(80, 24);
    // "Copy"(4) + shortcut "Ctrl+C"(6) + 2 gap = 12, + border(2) + padding(2) = 16
    expect(w.measuredWidth).toBe(16);
    // 2 rows + border(2) = 4
    expect(w.measuredHeight).toBe(4);
  });
});

describe("onMouseDown routing", () => {
  test("press delivers onMouseDown for any button; onClick stays left-only", async () => {
    const downs: string[] = [];
    const clicks: number[] = [];
    const { driver, findById, settle } = await mountApp(
      <VBox>
        <Box
          id="b"
          style={{ width: 10, height: 3 }}
          onMouseDown={(ev) => downs.push(ev.button)}
          onClick={() => clicks.push(1)}
        />
      </VBox>,
      { cols: 20, rows: 6 },
    );
    await settle();
    const r = findById("b").getClientRect();
    driver.simulateMouse(r.x + 1, r.y + 1, "press", "right");
    await settle();
    driver.simulateMouse(r.x + 1, r.y + 1, "press", "left");
    await settle();
    expect(downs).toEqual(["right", "left"]);
    expect(clicks).toEqual([1]);
  });

  test("onMouseDown/onClick bubble to a container when a leaf child is clicked", async () => {
    const downs: string[] = [];
    let clicked = false;
    const { driver, findById, settle } = await mountApp(
      <VBox>
        <Box
          id="row"
          style={{ width: 16, height: 1 }}
          onMouseDown={(ev) => downs.push(ev.button)}
          onClick={() => {
            clicked = true;
          }}
        >
          <Label id="lbl">file.ts</Label>
        </Box>
      </VBox>,
      { cols: 24, rows: 5 },
    );
    await settle();
    // Click lands on the inner Label, but the handlers live on the Box parent.
    const r = findById("lbl").getClientRect();
    driver.simulateMouse(r.x + 1, r.y, "press", "right");
    await settle();
    driver.simulateMouse(r.x + 1, r.y, "press", "left");
    await settle();
    expect(downs).toEqual(["right", "left"]); // bubbled up from the Label
    expect(clicked).toBe(true);
  });
});

describe("ContextMenu overlay", () => {
  function Harness({ onPick }: { onPick: (label: string) => void }) {
    const m = useContextMenu();
    // biome-ignore lint/correctness/useExhaustiveDependencies: open once on mount
    useEffect(() => m.openAt(2, 1), []);
    return (
      <VBox style={{ width: 30, height: 8 }}>
        <ContextMenu
          {...m.props}
          items={[{ label: "Alpha" }, { label: "Beta" }]}
          onSelect={(item) => onPick(item.label ?? "")}
        />
      </VBox>
    );
  }

  test("opens at a point, navigates, selects, and closes", async () => {
    const picks: string[] = [];
    const { text, driver, settle } = await mountApp(<Harness onPick={(l) => picks.push(l)} />, {
      cols: 30,
      rows: 8,
    });
    await settle();
    expect(text()).toContain("Alpha");
    expect(text()).toContain("Beta");

    driver.simulateKey("down", "down"); // highlight Beta
    await settle();
    driver.simulateKey("enter", "enter"); // select + close
    await settle();

    expect(picks).toEqual(["Beta"]);
    expect(text()).not.toContain("Alpha"); // menu dismissed
  });

  test("renders icons, right-aligned shortcuts, and separator rules", async () => {
    function Rich() {
      const m = useContextMenu();
      // biome-ignore lint/correctness/useExhaustiveDependencies: open once on mount
      useEffect(() => m.openAt(1, 1), []);
      return (
        <VBox style={{ width: 36, height: 10 }}>
          <ContextMenu
            {...m.props}
            items={[
              { label: "Copy", icon: "⧉", shortcut: "Ctrl+C" },
              { separator: true },
              { label: "Erase", danger: true, disabled: true },
            ]}
          />
        </VBox>
      );
    }
    const { text, settle } = await mountApp(<Rich />, { cols: 36, rows: 10 });
    await settle();
    const out = text();
    expect(out).toContain("Copy");
    expect(out).toContain("Ctrl+C"); // right-aligned shortcut
    expect(out).toContain("⧉"); // icon
    expect(out).toContain("Erase");
    expect(out).toContain("─"); // separator rule
  });

  function OpenAt({ px, py }: { px: number; py: number }) {
    const m = useContextMenu();
    // biome-ignore lint/correctness/useExhaustiveDependencies: open once on mount
    useEffect(() => m.openAt(px, py), []);
    return (
      <VBox style={{ width: 30, height: 10 }}>
        <ContextMenu
          {...m.props}
          items={[{ label: "Alpha" }, { label: "Beta" }, { label: "Gam" }]}
        />
      </VBox>
    );
  }

  test("flips up/left so a menu near the corner is never clipped", async () => {
    // The screen floors at 80x24; click near its bottom-right corner.
    const { screen, settle } = await mountApp(<OpenAt px={78} py={23} />, { cols: 80, rows: 24 });
    await settle();
    const region = (screen.overlays[0].children[0] as any).region;
    // Fully on-screen…
    expect(region.right).toBeLessThanOrEqual(80);
    expect(region.bottom).toBeLessThanOrEqual(24);
    // …and flipped to open up/left of the click point (78,23), not down-right.
    expect(region.y).toBeLessThan(23);
    expect(region.x).toBeLessThan(78);
  });

  test("opens down-right of the point when there is room", async () => {
    const { screen, settle } = await mountApp(<OpenAt px={2} py={1} />, { cols: 30, rows: 10 });
    await settle();
    const region = (screen.overlays[0].children[0] as any).region;
    expect(region.x).toBe(2);
    expect(region.y).toBe(1);
  });

  test("hovering a row highlights it", async () => {
    const { screen, driver, settle } = await mountApp(<OpenAt px={2} py={1} />, {
      cols: 30,
      rows: 10,
    });
    await settle();
    const menuList = screen.overlays[0].children[0] as any;
    expect(menuList.highlightedIndex).toBe(0);
    const rect = menuList.getContentRect();
    driver.simulateMouse(rect.x + 1, rect.y + 2, "move", "none"); // third row (Gam)
    await settle();
    expect(menuList.highlightedIndex).toBe(2);
  });

  test("Escape dismisses without selecting", async () => {
    const picks: string[] = [];
    const { text, driver, settle } = await mountApp(<Harness onPick={(l) => picks.push(l)} />, {
      cols: 30,
      rows: 8,
    });
    await settle();
    expect(text()).toContain("Alpha");
    driver.simulateKey("escape", "escape");
    await settle();
    expect(picks).toEqual([]);
    expect(text()).not.toContain("Alpha");
  });
});

describe("ContextMenu submenus", () => {
  function SubHarness({ onPick }: { onPick: (label: string) => void }) {
    const m = useContextMenu();
    // biome-ignore lint/correctness/useExhaustiveDependencies: open once on mount
    useEffect(() => m.openAt(2, 1), []);
    return (
      <VBox style={{ width: 40, height: 12 }}>
        <ContextMenu
          {...m.props}
          items={[
            { label: "Open" },
            { label: "More", submenu: [{ label: "Sub A" }, { label: "Sub B" }] },
          ]}
          onSelect={(item) => onPick(item.label ?? "")}
        />
      </VBox>
    );
  }

  test("→ opens a submenu beside the parent and Enter selects a nested leaf", async () => {
    const picks: string[] = [];
    const { text, driver, settle } = await mountApp(<SubHarness onPick={(l) => picks.push(l)} />, {
      cols: 40,
      rows: 12,
    });
    await settle();
    expect(text()).toContain("More");
    expect(text()).toContain("▸"); // submenu chevron
    expect(text()).not.toContain("Sub A");

    driver.simulateKey("down", "down"); // highlight "More"
    await settle();
    driver.simulateKey("right", "right"); // open its submenu (focus moves in)
    await settle();
    expect(text()).toContain("Sub A");
    expect(text()).toContain("Sub B");

    driver.simulateKey("enter", "enter"); // select "Sub A"
    await settle();
    expect(picks).toEqual(["Sub A"]);
    expect(text()).not.toContain("Open"); // whole menu dismissed
  });

  test("← backs out of a submenu, leaving the parent open", async () => {
    const { text, driver, settle } = await mountApp(<SubHarness onPick={() => {}} />, {
      cols: 40,
      rows: 12,
    });
    await settle();
    driver.simulateKey("down", "down");
    await settle();
    driver.simulateKey("right", "right");
    await settle();
    expect(text()).toContain("Sub A");

    driver.simulateKey("left", "left");
    await settle();
    expect(text()).not.toContain("Sub A"); // submenu closed
    expect(text()).toContain("Open"); // parent still open
  });

  test("→ on an already-open submenu row just refocuses the existing child", async () => {
    const { screen, text, driver, settle } = await mountApp(<SubHarness onPick={() => {}} />, {
      cols: 40,
      rows: 12,
    });
    await settle();
    const parentMenu = screen.overlays[0].children[0] as MenuListWidget;
    driver.simulateKey("down", "down"); // highlight "More"
    await settle();
    parentMenu.handleKey(key("right")); // opens the submenu, focuses the child
    await settle();
    expect(text()).toContain("Sub A");
    // Press → again directly on the parent (same row, submenu already open):
    // hits the "reuse the existing childMenu" branch instead of reopening it.
    expect(() => parentMenu.handleKey(key("right"))).not.toThrow();
    await settle();
    expect(text()).toContain("Sub A");
  });

  test("hovering a submenu row opens it", async () => {
    const { screen, text, driver, settle } = await mountApp(<SubHarness onPick={() => {}} />, {
      cols: 40,
      rows: 12,
    });
    await settle();
    const menuList = screen.overlays[0].children[0] as any;
    const rect = menuList.getContentRect();
    driver.simulateMouse(rect.x + 1, rect.y + 1, "move", "none"); // hover "More" (row 1)
    await settle();
    expect(text()).toContain("Sub A");
  });
});
