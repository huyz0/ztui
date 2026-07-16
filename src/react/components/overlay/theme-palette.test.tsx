import { StrictMode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ThemeManager } from "../../../core.ts";
import type { Widget } from "../../../dom/widget.ts";
import { ThemePalette, VBox } from "../../../react.ts";
import { mountApp } from "../../../test/harness.tsx";

type Mounted = Awaited<ReturnType<typeof mountApp>>;

function Host() {
  return (
    <VBox style={{ width: "100%", height: "100%" }}>
      <ThemePalette toggleKey="f3" />
    </VBox>
  );
}

async function open(t: Mounted): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!t.text().includes("Themes")) {
    if (Date.now() >= deadline) throw new Error("theme palette did not open");
    t.driver.simulateKey("f3", "f3");
    await t.settle(20);
  }
}

async function press(t: Mounted, key: string): Promise<void> {
  t.driver.simulateKey(key, key);
  await t.settle();
}

async function typeFilter(t: Mounted, text: string): Promise<void> {
  for (const ch of text) t.driver.simulateKey(ch, ch);
  await t.settle();
}

describe("ThemePalette", () => {
  afterEach(() => {
    ThemeManager.getInstance().setTheme("default-dark");
  });

  test("opens on its toggle key and lists registered themes", async () => {
    const t = await mountApp(<Host />, { cols: 80, rows: 24 });
    await open(t);
    const screen = t.text();
    expect(screen).toContain("default-dark");
    expect(screen).toContain("default-light");
  });

  test("defaultValue is skipped when it already matches the active theme", async () => {
    const manager = ThemeManager.getInstance();
    manager.setTheme("nord");
    const spy = vi.spyOn(manager, "setTheme");
    const t = await mountApp(
      <VBox style={{ width: "100%", height: "100%" }}>
        <ThemePalette toggleKey="f3" defaultValue="nord" />
      </VBox>,
      { cols: 80, rows: 40 },
    );
    await t.settle();
    // Already on "nord": the mount effect must not redundantly re-apply it.
    expect(spy).not.toHaveBeenCalled();
    expect(manager.getActiveThemeName()).toBe("nord");
  });

  test("filters themes and shows an empty state when nothing matches", async () => {
    const t = await mountApp(<Host />, { cols: 80, rows: 24 });
    await open(t);
    await typeFilter(t, "nord");
    expect(t.text()).toContain("nord");
    expect(t.text()).not.toContain("dracula");

    await typeFilter(t, "zzz");
    expect(t.text()).toContain("No themes match");
  });

  test("arrow keys preview live; Enter applies but keeps the picker open", async () => {
    const manager = ThemeManager.getInstance();
    manager.setTheme("default-dark");
    const t = await mountApp(<Host />, { cols: 80, rows: 40 });
    await open(t);

    // The selection starts on the active theme (default-dark, index 0). The
    // grid is multi-column, so the next theme (default-light, index 1) is the
    // card to the right; moving there previews it immediately.
    await press(t, "right");
    expect(manager.getActiveThemeName()).toBe("default-light");

    // Enter applies the theme but does NOT close — so it can be seen first.
    await press(t, "enter");
    expect(manager.getActiveThemeName()).toBe("default-light");
    expect(t.text()).toContain("Themes"); // still open

    // Esc now keeps the committed theme (rather than reverting) and closes.
    await press(t, "escape");
    expect(manager.getActiveThemeName()).toBe("default-light");
    expect(t.text()).not.toContain("Themes"); // closed
  });

  test("scrolls to reach themes below the visible window", async () => {
    const t = await mountApp(<Host />, { cols: 80, rows: 40 });
    await open(t);

    // The first window shows the top rows; the last themes are off-screen.
    expect(t.text()).toContain("default-dark");
    expect(t.text()).not.toContain("nightfly");

    // Page down twice walks the selection (and the scroll window) to the end.
    await press(t, "pagedown");
    await press(t, "pagedown");

    expect(t.text()).toContain("nightfly"); // last theme now visible
    expect(t.text()).not.toContain("default-dark"); // top scrolled off

    // Paging back up must scroll the window back up too (not just clamp the
    // selection index), exercising the "selection above the view" branch.
    await press(t, "pageup");
    await press(t, "pageup");
    expect(t.text()).toContain("default-dark");
    expect(t.text()).not.toContain("nightfly");
  });

  test("value binds the active theme and onSelect reports applied themes", async () => {
    const manager = ThemeManager.getInstance();
    manager.setTheme("default-dark");
    const picked: string[] = [];
    const t = await mountApp(
      <VBox style={{ width: "100%", height: "100%" }}>
        <ThemePalette toggleKey="f3" value="nord" onSelect={(th) => picked.push(th.name)} />
      </VBox>,
      { cols: 80, rows: 40 },
    );
    await t.settle();
    // The controlled `value` is applied on mount (restores a persisted choice).
    expect(manager.getActiveThemeName()).toBe("nord");

    await open(t);
    // Selection starts on the active theme (nord). Move right to dracula and
    // apply it — onSelect fires with the applied theme (the persist hook).
    await press(t, "right");
    await press(t, "enter");
    expect(picked.at(-1)).toBe("dracula");
    expect(manager.getActiveThemeName()).toBe("dracula");
  });

  test("mouse wheel scrolls the grid", async () => {
    const t = await mountApp(<Host />, { cols: 80, rows: 40 });
    await open(t);
    expect(t.text()).toContain("default-dark");
    expect(t.text()).not.toContain("nightfly");

    // Wheel down over the (centered) modal scrolls the grid a row at a time.
    for (let i = 0; i < 20; i++) {
      t.driver.simulateMouse(40, 18, "scroll_down", "none");
      await t.settle();
    }
    expect(t.text()).toContain("nightfly"); // scrolled to the bottom
  });

  test("arrow-key preview applies the theme once, even under StrictMode", async () => {
    // Regression: `moveBy` called `preview()` (which calls `manager.setTheme`)
    // from inside the `setSelected` updater. React may invoke a state updater
    // twice to check purity (StrictMode does this on every state update, not
    // just on mount) — an updater with a side effect like this applied the
    // theme twice per keypress under StrictMode.
    const manager = ThemeManager.getInstance();
    manager.setTheme("default-dark");
    const spy = vi.spyOn(manager, "setTheme");
    const t = await mountApp(
      <StrictMode>
        <VBox style={{ width: "100%", height: "100%" }}>
          <ThemePalette toggleKey="f3" />
        </VBox>
      </StrictMode>,
      { cols: 80, rows: 40 },
    );
    await open(t);
    spy.mockClear();
    await press(t, "right");
    expect(manager.getActiveThemeName()).toBe("default-light");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("clicking a card selects and applies its theme", async () => {
    const manager = ThemeManager.getInstance();
    manager.setTheme("default-dark");
    const picked: string[] = [];
    const t = await mountApp(
      <VBox style={{ width: "100%", height: "100%" }}>
        <ThemePalette toggleKey="f3" onSelect={(th) => picked.push(th.name)} />
      </VBox>,
      { cols: 80, rows: 40 },
    );
    await open(t);

    // Find the card for "default-light" (not the currently selected one) and
    // click it directly — exercises ThemeCard's onClick and the palette's
    // pick() handler (as opposed to keyboard nav + Enter).
    let card: Widget | undefined;
    t.screen.layers[0].root.walk((n: unknown) => {
      const w = n as Widget;
      if ((w as { getTextContent?: () => string }).getTextContent?.()?.includes("default-light")) {
        card = w;
      }
    });
    expect(card).toBeDefined();
    const r = (card as Widget).region;
    t.driver.simulateMouse(r.x + 1, r.y + 1, "press", "left");
    await t.settle();

    expect(manager.getActiveThemeName()).toBe("default-light");
    expect(picked.at(-1)).toBe("default-light");
    expect(t.text()).toContain("Themes"); // still open after applying
  });

  test("Escape reverts the previewed theme", async () => {
    const manager = ThemeManager.getInstance();
    manager.setTheme("default-dark");
    const t = await mountApp(<Host />, { cols: 80, rows: 24 });
    await open(t);

    await press(t, "right");
    expect(manager.getActiveThemeName()).toBe("default-light");

    await press(t, "escape");
    expect(manager.getActiveThemeName()).toBe("default-dark");
    expect(t.text()).not.toContain("Themes"); // closed
  });
});
