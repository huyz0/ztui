import { afterEach, describe, expect, test } from "vitest";
import type { KeyEvent } from "../driver/driver.ts";
import {
  eventToKey,
  formatKeyLabel,
  HotkeyRegistry,
  isPriorityKey,
  matchesFilter,
  normalizeKey,
} from "./hotkeys.ts";

afterEach(() => HotkeyRegistry.reset());

const key = (overrides: Partial<KeyEvent>): KeyEvent => ({
  key: "",
  name: "",
  ctrl: false,
  meta: false,
  shift: false,
  ...overrides,
});

describe("normalizeKey", () => {
  test("lowercases and orders modifiers canonically", () => {
    expect(normalizeKey("Ctrl+Shift+P")).toBe("ctrl+shift+p");
    expect(normalizeKey("shift+ctrl+p")).toBe("ctrl+shift+p");
    expect(normalizeKey("ALT+Enter")).toBe("alt+enter");
  });

  test("resolves aliases", () => {
    expect(normalizeKey("ctrl+esc")).toBe("ctrl+escape");
    expect(normalizeKey("meta+x")).toBe("alt+x");
    expect(normalizeKey("ctrl+ ")).toBe("ctrl+space");
  });

  test("drops shift for single non-letter characters", () => {
    expect(normalizeKey("shift+?")).toBe("?");
    expect(normalizeKey("?")).toBe("?");
  });
});

describe("eventToKey", () => {
  test("modified letters", () => {
    expect(eventToKey(key({ key: "ctrl+p", name: "p", ctrl: true }))).toBe("ctrl+p");
    expect(eventToKey(key({ key: "ctrl+P", name: "p", ctrl: true, shift: true }))).toBe(
      "ctrl+shift+p",
    );
  });

  test("ctrl+space (legacy NUL parse shape)", () => {
    expect(eventToKey(key({ key: "ctrl+space", name: "space", ctrl: true }))).toBe("ctrl+space");
  });

  test("plain characters ignore reported shift", () => {
    expect(eventToKey(key({ key: "?", name: "?", shift: true }))).toBe("?");
  });
});

describe("helpers", () => {
  test("formatKeyLabel", () => {
    expect(formatKeyLabel("ctrl+shift+p")).toBe("Ctrl+Shift+P");
    expect(formatKeyLabel("space")).toBe("Space");
    expect(formatKeyLabel("?")).toBe("?");
  });

  test("isPriorityKey", () => {
    expect(isPriorityKey("ctrl+s")).toBe(true);
    expect(isPriorityKey("alt+enter")).toBe(true);
    expect(isPriorityKey("f5")).toBe(true);
    expect(isPriorityKey("?")).toBe(false);
    expect(isPriorityKey("enter")).toBe(false);
  });
});

describe("registry", () => {
  test("register / list / dispose", () => {
    const reg = HotkeyRegistry.getInstance();
    const dispose = reg.register({ key: "ctrl+s", name: "Save", handler: () => {} });
    expect(reg.list().map((h) => h.key)).toEqual(["ctrl+s"]);
    expect(reg.list()[0].group).toBe("General");
    expect(reg.list()[0].keyLabel).toBe("Ctrl+S");
    dispose();
    expect(reg.list()).toEqual([]);
  });

  test("dispatch runs the handler and marks the event handled", () => {
    const reg = HotkeyRegistry.getInstance();
    let ran = 0;
    reg.register({ key: "ctrl+s", name: "Save", handler: () => ran++ });
    const ev = key({ key: "ctrl+s", name: "s", ctrl: true });
    expect(reg.dispatch(ev, "priority")).toBe(true);
    expect(ran).toBe(1);
    expect(ev.handled).toBe(true);
  });

  test("phase gating: bare keys only fire in the fallback phase", () => {
    const reg = HotkeyRegistry.getInstance();
    let ran = 0;
    reg.register({ key: "?", name: "Help", handler: () => ran++ });
    const ev = key({ key: "?", name: "?" });
    expect(reg.dispatch(ev, "priority")).toBe(false);
    expect(ran).toBe(0);
    expect(reg.dispatch(ev, "fallback")).toBe(true);
    expect(ran).toBe(1);
  });

  test("last registration wins; disposing it restores the older binding", () => {
    const reg = HotkeyRegistry.getInstance();
    const calls: string[] = [];
    reg.register({ key: "ctrl+k", name: "Old", handler: () => calls.push("old") });
    const disposeNew = reg.register({
      key: "ctrl+k",
      name: "New",
      handler: () => calls.push("new"),
    });
    reg.dispatch(key({ key: "ctrl+k", name: "k", ctrl: true }), "priority");
    disposeNew();
    reg.dispatch(key({ key: "ctrl+k", name: "k", ctrl: true }), "priority");
    expect(calls).toEqual(["new", "old"]);
  });

  test("context scoping is dynamic", () => {
    const reg = HotkeyRegistry.getInstance();
    let editor = 0;
    let global = 0;
    reg.register({ key: "ctrl+b", name: "Bold", context: "editor", handler: () => editor++ });
    reg.register({ key: "ctrl+q", name: "Quit", handler: () => global++ });

    // No context: only the global binding is active or listed.
    expect(reg.dispatch(key({ key: "ctrl+b", name: "b", ctrl: true }), "priority")).toBe(false);
    expect(reg.list().map((h) => h.name)).toEqual(["Quit"]);

    reg.setContext("editor");
    expect(reg.dispatch(key({ key: "ctrl+b", name: "b", ctrl: true }), "priority")).toBe(true);
    expect(reg.dispatch(key({ key: "ctrl+q", name: "q", ctrl: true }), "priority")).toBe(true);
    expect(reg.list().map((h) => h.name)).toEqual(["Bold", "Quit"]);

    reg.pushContext("browser");
    expect(reg.context).toBe("browser");
    expect(reg.dispatch(key({ key: "ctrl+b", name: "b", ctrl: true }), "priority")).toBe(false);
    reg.popContext();
    expect(reg.context).toBe("editor");
    expect(editor).toBe(1);
    expect(global).toBe(1);
  });

  test("enabled() gates dispatch and listing", () => {
    const reg = HotkeyRegistry.getInstance();
    let on = false;
    reg.register({ key: "ctrl+d", name: "Delete", enabled: () => on, handler: () => {} });
    expect(reg.dispatch(key({ key: "ctrl+d", name: "d", ctrl: true }), "priority")).toBe(false);
    expect(reg.list()).toEqual([]);
    on = true;
    expect(reg.dispatch(key({ key: "ctrl+d", name: "d", ctrl: true }), "priority")).toBe(true);
    expect(reg.list().length).toBe(1);
  });

  test("hidden hotkeys dispatch but stay out of the default listing", () => {
    const reg = HotkeyRegistry.getInstance();
    reg.register({ key: "ctrl+t", name: "Secret", hidden: true, handler: () => {} });
    expect(reg.list()).toEqual([]);
    expect(reg.list({ includeHidden: true }).length).toBe(1);
    expect(reg.dispatch(key({ key: "ctrl+t", name: "t", ctrl: true }), "priority")).toBe(true);
  });

  test("groups() sections in first-appearance order and filters by query", () => {
    const reg = HotkeyRegistry.getInstance();
    reg.register({ key: "ctrl+s", name: "Save", group: "File", handler: () => {} });
    reg.register({ key: "ctrl+g", name: "Go to line", group: "Navigation", handler: () => {} });
    reg.register({
      key: "ctrl+o",
      name: "Open",
      group: "File",
      description: "Open a file",
      handler: () => {},
    });

    const all = reg.groups();
    expect(all.map((g) => g.group)).toEqual(["File", "Navigation"]);
    expect(all[0].hotkeys.map((h) => h.name)).toEqual(["Save", "Open"]);

    const filtered = reg.groups({ query: "open" });
    expect(filtered.length).toBe(1);
    expect(filtered[0].hotkeys.map((h) => h.name)).toEqual(["Open"]);
  });

  test("matchesFilter searches key label, name, description, and group", () => {
    const reg = HotkeyRegistry.getInstance();
    reg.register({
      key: "ctrl+shift+p",
      name: "Command palette",
      description: "Show all commands",
      group: "Help",
      handler: () => {},
    });
    const h = reg.list()[0];
    expect(matchesFilter(h, "palette")).toBe(true);
    expect(matchesFilter(h, "show all")).toBe(true);
    expect(matchesFilter(h, "help")).toBe(true);
    expect(matchesFilter(h, "ctrl+shift")).toBe(true);
    expect(matchesFilter(h, "zzz")).toBe(false);
  });
});
