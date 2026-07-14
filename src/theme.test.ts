import { describe, expect, test } from "vitest";
import { isColorLight, ThemeManager } from "./theme.ts";

describe("isColorLight", () => {
  test("classifies rgb()/named colors correctly instead of always reporting dark", () => {
    // Regression: isColorLight only understood #hex, returning false (dark)
    // for any other format -- even though rgb()/rgba()/named colors are valid
    // Theme.colors values everywhere else in the codebase (parseColor already
    // supports them). A light theme built with e.g. background: "rgb(240,
    // 240, 240)" or "white" was misclassified as dark, flipping the focus/
    // attention breathing glow's contrast pole and border derivations.
    expect(isColorLight("rgb(240, 240, 240)")).toBe(true);
    expect(isColorLight("white")).toBe(true);
    expect(isColorLight("rgb(10, 10, 10)")).toBe(false);
    expect(isColorLight("black")).toBe(false);
    // #hex still works as before.
    expect(isColorLight("#ffffff")).toBe(true);
    expect(isColorLight("#000000")).toBe(false);
  });
});

describe("ThemeManager.register fills border/focus/selectionBg/selectionFg defaults", () => {
  test("a theme that omits them gets sensible fallbacks instead of undefined", () => {
    // Regression: these four tokens are optional on Theme.colors and 15 of the
    // 25 built-in themes omitted them outright — any component reading them
    // directly (rather than through a `|| fallback` at the call site) would
    // silently get `undefined`. register() now backfills them centrally.
    const mgr = ThemeManager.getInstance();
    mgr.register({
      name: "test-minimal-theme",
      colors: {
        primary: "#111111",
        secondary: "#222222",
        background: "#000000",
        foreground: "#eeeeee",
        surface: "#101010",
        panel: "#202020",
        accent: "#333333",
        success: "#00ff00",
        warning: "#ffff00",
        error: "#ff0000",
      },
    });
    const theme = mgr.getTheme("test-minimal-theme")!;
    expect(theme.colors.border).toBe(theme.colors.panel);
    expect(theme.colors.focus).toBe(theme.colors.primary);
    expect(theme.colors.selectionBg).toBe(theme.colors.primary);
    expect(theme.colors.selectionFg).toBe(theme.colors.background);
  });

  test("a theme that already sets them is left untouched", () => {
    const mgr = ThemeManager.getInstance();
    mgr.register({
      name: "test-explicit-theme",
      colors: {
        primary: "#111111",
        secondary: "#222222",
        background: "#000000",
        foreground: "#eeeeee",
        surface: "#101010",
        panel: "#202020",
        accent: "#333333",
        success: "#00ff00",
        warning: "#ffff00",
        error: "#ff0000",
        border: "#abcdef",
        focus: "#fedcba",
        selectionBg: "#123123",
        selectionFg: "#321321",
      },
    });
    const theme = mgr.getTheme("test-explicit-theme")!;
    expect(theme.colors.border).toBe("#abcdef");
    expect(theme.colors.focus).toBe("#fedcba");
    expect(theme.colors.selectionBg).toBe("#123123");
    expect(theme.colors.selectionFg).toBe("#321321");
  });
});
