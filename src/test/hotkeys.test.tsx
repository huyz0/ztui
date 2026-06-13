import { afterEach, describe, expect, test } from "vitest";
import { HotkeyRegistry, hotkeys } from "../core/hotkeys.ts";
import type { KeyEvent } from "../driver/driver.ts";
import { HotkeyPalette, Input, Label, VBox } from "../react.ts";
import { mountApp } from "./harness.tsx";

afterEach(() => HotkeyRegistry.reset());

const key = (overrides: Partial<KeyEvent>): KeyEvent => ({
  key: "",
  name: "",
  ctrl: false,
  meta: false,
  shift: false,
  ...overrides,
});

describe("app hotkey dispatch", () => {
  test("a modified hotkey fires even while an input is focused", async () => {
    HotkeyRegistry.reset();
    let saved = 0;
    hotkeys.register({ key: "ctrl+s", name: "Save", handler: () => saved++ });
    const { driver, findById, screen, settle } = await mountApp(
      <VBox>
        <Input id="field" />
      </VBox>,
      { cols: 60, rows: 10 },
    );
    await settle();
    screen.focusWidget(findById("field")!);
    driver.emit("key", key({ key: "ctrl+s", name: "s", ctrl: true }));
    expect(saved).toBe(1);
  });

  test("a bare-key hotkey is typing first, hotkey only when unclaimed", async () => {
    HotkeyRegistry.reset();
    let help = 0;
    hotkeys.register({ key: "?", name: "Help", handler: () => help++ });
    const { driver, findById, screen, settle } = await mountApp(
      <VBox>
        <Input id="field" />
        <Label>plain</Label>
      </VBox>,
      { cols: 60, rows: 10 },
    );
    await settle();

    // Focused input consumes "?" as text; the hotkey must not fire.
    const field = findById("field");
    screen.focusWidget(field);
    driver.emit("key", key({ key: "?", name: "?" }));
    expect(help).toBe(0);
    expect(field.value ?? field.text ?? "").toContain("?");

    // With nothing focused, the same key reaches the hotkey.
    screen.focusWidget(null);
    driver.emit("key", key({ key: "?", name: "?" }));
    expect(help).toBe(1);
  });

  test("context switches change which binding fires", async () => {
    HotkeyRegistry.reset();
    const calls: string[] = [];
    hotkeys.register({
      key: "ctrl+b",
      name: "Bold",
      context: "editor",
      handler: () => calls.push("bold"),
    });
    const { driver, settle } = await mountApp(<Label>x</Label>, { cols: 60, rows: 10 });
    await settle();

    driver.emit("key", key({ key: "ctrl+b", name: "b", ctrl: true }));
    expect(calls).toEqual([]);
    hotkeys.setContext("editor");
    driver.emit("key", key({ key: "ctrl+b", name: "b", ctrl: true }));
    expect(calls).toEqual(["bold"]);
  });
});

describe("HotkeyPalette", () => {
  const toggle = () => key({ key: "ctrl+space", name: "space", ctrl: true });

  test("Ctrl+Space opens the palette listing hotkeys by group; Esc closes", async () => {
    HotkeyRegistry.reset();
    hotkeys.register({
      key: "ctrl+s",
      name: "Save file",
      description: "Write to disk",
      group: "File",
      handler: () => {},
    });
    const { driver, settle, text } = await mountApp(
      <VBox>
        <Label>app</Label>
        <HotkeyPalette />
      </VBox>,
      { cols: 80, rows: 24 },
    );
    await settle();
    expect(text()).not.toContain("Commands");

    driver.emit("key", toggle());
    await settle();
    const frame = text();
    expect(frame).toContain("Commands");
    expect(frame).toContain("FILE");
    expect(frame).toContain("Ctrl+S");
    expect(frame).toContain("Save file");
    expect(frame).toContain("Write to disk");
    // The palette's own toggle binding is hidden from its list (self-referential
    // noise), so the HELP group it lives in does not appear.
    expect(frame).not.toContain("HELP");

    driver.emit("key", key({ key: "escape", name: "escape" }));
    await settle();
    expect(text()).not.toContain("Commands");
  });

  test("typing filters by name/description/group", async () => {
    HotkeyRegistry.reset();
    hotkeys.register({ key: "ctrl+s", name: "Save file", group: "File", handler: () => {} });
    hotkeys.register({ key: "ctrl+g", name: "Go to line", group: "Navigation", handler: () => {} });
    const { driver, settle, text } = await mountApp(<HotkeyPalette />, { cols: 80, rows: 24 });
    await settle();
    driver.emit("key", toggle());
    await settle();
    expect(text()).toContain("Go to line");

    for (const ch of "save") {
      driver.emit("key", key({ key: ch, name: ch }));
    }
    await settle();
    const frame = text();
    expect(frame).toContain("Save file");
    expect(frame).not.toContain("Go to line");
  });

  test("Enter runs the selected command and closes the palette", async () => {
    HotkeyRegistry.reset();
    let ran = 0;
    hotkeys.register({ key: "ctrl+r", name: "Run thing", group: "Actions", handler: () => ran++ });
    const { driver, settle, text } = await mountApp(<HotkeyPalette />, { cols: 80, rows: 24 });
    await settle();
    driver.emit("key", toggle());
    await settle();

    // Selection starts on the first command ("Run thing" — Actions registers
    // before the palette's own Help group binding).
    driver.emit("key", key({ key: "enter", name: "enter" }));
    await settle();
    expect(ran).toBe(1);
    expect(text()).not.toContain("Commands");
  });

  test("toggling again closes the palette even though it is modal", async () => {
    HotkeyRegistry.reset();
    const { driver, settle, text } = await mountApp(<HotkeyPalette />, { cols: 80, rows: 24 });
    await settle();
    driver.emit("key", toggle());
    await settle();
    expect(text()).toContain("Commands");
    driver.emit("key", toggle());
    await settle();
    expect(text()).not.toContain("Commands");
  });
});
