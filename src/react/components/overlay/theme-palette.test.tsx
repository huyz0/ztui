import { afterEach, describe, expect, test } from "vitest";
import { ThemeManager } from "../../../core.ts";
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

  test("filters themes and shows an empty state when nothing matches", async () => {
    const t = await mountApp(<Host />, { cols: 80, rows: 24 });
    await open(t);
    await typeFilter(t, "nord");
    expect(t.text()).toContain("nord");
    expect(t.text()).not.toContain("dracula");

    await typeFilter(t, "zzz");
    expect(t.text()).toContain("No themes match");
  });

  test("arrow keys preview live and Enter confirms the theme", async () => {
    const manager = ThemeManager.getInstance();
    manager.setTheme("default-dark");
    const t = await mountApp(<Host />, { cols: 80, rows: 24 });
    await open(t);

    // The selection starts on the active theme (default-dark, index 0); one
    // arrow down previews the next registered theme immediately.
    await press(t, "down");
    expect(manager.getActiveThemeName()).toBe("default-light");

    await press(t, "enter");
    expect(manager.getActiveThemeName()).toBe("default-light");
    expect(t.text()).not.toContain("Themes"); // closed
  });

  test("Escape reverts the previewed theme", async () => {
    const manager = ThemeManager.getInstance();
    manager.setTheme("default-dark");
    const t = await mountApp(<Host />, { cols: 80, rows: 24 });
    await open(t);

    await press(t, "down");
    expect(manager.getActiveThemeName()).toBe("default-light");

    await press(t, "escape");
    expect(manager.getActiveThemeName()).toBe("default-dark");
    expect(t.text()).not.toContain("Themes"); // closed
  });
});
