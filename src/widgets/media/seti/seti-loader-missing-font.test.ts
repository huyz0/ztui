import { describe, expect, test, vi } from "vitest";

// Isolated module registry (like seti-loader-missing-theme.test.ts) so this
// file's fs mock doesn't leak into — or get clobbered by — the happy-path
// tests in seti.test.tsx.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    // The theme JSON exists, but the WOFF font file doesn't — exercises
    // ensureFontLoaded's "font not found" throw and registerSetiIcon's catch
    // that falls back to a blank glyph instead of propagating.
    existsSync: (path: string) => !String(path).endsWith(".woff"),
  };
});

describe("registerSetiIcon with an unavailable font file", () => {
  test("falls back to a blank glyph instead of throwing", async () => {
    const { loadSetiTheme, registerSetiIcon } = await import("./seti-loader.ts");
    const { iconRegistry } = await import("../../../core.ts");

    loadSetiTheme();
    registerSetiIcon("_typescript");

    const icon = iconRegistry.get("seti:_typescript");
    expect(icon).toBeDefined();
    expect(icon?.svg).toBe("");
    expect(icon?.textFallback).toBe(" ");
  });

  test("loadSetiTheme is a no-op once the theme is already loaded", async () => {
    const { loadSetiTheme } = await import("./seti-loader.ts");
    expect(() => {
      loadSetiTheme();
      loadSetiTheme(); // second call must hit the early-return guard, not re-parse
    }).not.toThrow();
  });
});

describe("registerSetiIcon with an unrecognized key", () => {
  test("caches the key as unresolvable without registering an icon", async () => {
    const { loadSetiTheme, registerSetiIcon } = await import("./seti-loader.ts");
    const { iconRegistry } = await import("../../../core.ts");

    loadSetiTheme();
    registerSetiIcon("this-key-does-not-exist-in-the-theme");

    expect(iconRegistry.get("seti:this-key-does-not-exist-in-the-theme")).toBeUndefined();
  });
});
