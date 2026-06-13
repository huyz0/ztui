import { describe, expect, test } from "vitest";
import { HotkeyPalette, useHotkey, VBox } from "../../../react.ts";
import { mountApp } from "../../../test/harness.tsx";

type Mounted = Awaited<ReturnType<typeof mountApp>>;

const ran: string[] = [];

// A host that registers a few commands across two groups, plus the palette
// (toggled by F2 — a function key, reliably delivered, and not ctrl+space).
function Host() {
  useHotkey({ key: "ctrl+s", name: "Save File", group: "File", handler: () => ran.push("save") });
  useHotkey({ key: "ctrl+o", name: "Open File", group: "File", handler: () => ran.push("open") });
  useHotkey({
    key: "ctrl+f",
    name: "Find",
    description: "Search the buffer",
    group: "Edit",
    handler: () => ran.push("find"),
  });
  return (
    <VBox style={{ width: "100%", height: "100%" }}>
      <HotkeyPalette toggleKey="f2" />
    </VBox>
  );
}

async function open(t: Mounted): Promise<void> {
  // Toggle until the palette chrome is on screen (robust to a dropped frame).
  const deadline = Date.now() + 2000;
  while (!t.text().includes("Commands")) {
    if (Date.now() >= deadline) throw new Error("palette did not open");
    t.driver.simulateKey("f2", "f2");
    await t.settle(20);
  }
}

/** Type into the focused filter Input via real key events. */
async function typeFilter(t: Mounted, text: string): Promise<void> {
  for (const ch of text) t.driver.simulateKey(ch, ch);
  await t.settle();
}

async function press(t: Mounted, key: string): Promise<void> {
  t.driver.simulateKey(key, key);
  await t.settle();
}

describe("HotkeyPalette", () => {
  test("opens on its toggle key and lists registered commands by group", async () => {
    ran.length = 0;
    const t = await mountApp(<Host />, { cols: 80, rows: 24 });
    await open(t);
    const screen = t.text();
    expect(screen).toContain("Save File");
    expect(screen).toContain("Open File");
    expect(screen).toContain("Find");
    expect(screen).toContain("FILE"); // group header (upper-cased)
    expect(screen).toContain("EDIT");
  });

  test("filters the list and shows an empty state when nothing matches", async () => {
    const t = await mountApp(<Host />, { cols: 80, rows: 24 });
    await open(t);
    await typeFilter(t, "find");
    expect(t.text()).toContain("Find");
    expect(t.text()).not.toContain("Save File");

    await typeFilter(t, "zzz"); // "findzzz" — no match
    expect(t.text()).toContain("No commands match");
  });

  test("Enter runs the selected command; arrows move the selection", async () => {
    ran.length = 0;
    const t = await mountApp(<Host />, { cols: 80, rows: 24 });
    await open(t);
    // First item selected → Enter runs it.
    await press(t, "enter");
    await t.settle();
    expect(ran).toEqual(["save"]);
    expect(t.text()).not.toContain("Commands"); // palette closed after running

    // Reopen, move down twice, run the third command.
    await open(t);
    await press(t, "down");
    await press(t, "down");
    await press(t, "enter");
    await t.settle();
    expect(ran).toEqual(["save", "find"]);
  });

  test("down navigation clamps at the last item (no overrun)", async () => {
    ran.length = 0;
    const t = await mountApp(<Host />, { cols: 80, rows: 24 });
    await open(t);
    // Press down far past the end, then Enter — must run the last item, not crash.
    for (let i = 0; i < 10; i++) await press(t, "down");
    await press(t, "enter");
    await t.settle();
    expect(ran).toEqual(["find"]);
  });

  test("PageDown pages through a long, windowed list", async () => {
    const hit: string[] = [];
    function Many() {
      // 20 commands → more than the default 14 visible rows, so the list windows.
      for (let i = 0; i < 20; i++) {
        // biome-ignore lint/correctness/useHookAtTopLevel: fixed-length loop, stable order
        useHotkey({
          key: `ctrl+${i}`,
          name: `cmd${i}`,
          group: "G",
          handler: () => hit.push(`cmd${i}`),
        });
      }
      return (
        <VBox style={{ width: "100%", height: "100%" }}>
          <HotkeyPalette toggleKey="f2" maxVisible={14} />
        </VBox>
      );
    }
    const t = await mountApp(<Many />, { cols: 80, rows: 30 });
    await open(t);
    expect(t.text()).toContain("↓"); // "more below" indicator while windowed
    // PageDown jumps one page (maxVisible) from the first item → cmd14.
    await press(t, "pagedown");
    await press(t, "enter");
    await t.settle();
    expect(hit).toEqual(["cmd14"]);
  });

  test("Escape closes the palette", async () => {
    const t = await mountApp(<Host />, { cols: 80, rows: 24 });
    await open(t);
    expect(t.text()).toContain("Commands");
    await press(t, "escape");
    expect(t.text()).not.toContain("Commands");
  });
});
