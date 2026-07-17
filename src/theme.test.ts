import { describe, expect, test } from "vitest";
import {
  adjustLightness,
  deriveTheme,
  isColorLight,
  isThemeLight,
  type Theme,
  ThemeManager,
  themeBlendBase,
} from "./theme.ts";

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

  test("an unparseable color is treated as dark", () => {
    expect(isColorLight("not-a-real-color")).toBe(false);
  });
});

describe("isThemeLight", () => {
  test("falls back to the default dark background when a theme omits one", () => {
    const theme = { colors: {} } as Theme;
    expect(isThemeLight(theme)).toBe(false); // #121212 fallback is dark
  });
});

describe("themeBlendBase", () => {
  test("falls back to pure black/white when the active theme's colors don't parse", () => {
    const mgr = ThemeManager.getInstance();
    mgr.register({
      name: "test-unparseable-colors",
      colors: {
        primary: "#111111",
        secondary: "#222222",
        background: "not-a-color",
        foreground: "also-not-a-color",
        surface: "#101010",
        panel: "#202020",
        accent: "#333333",
        success: "#00ff00",
        warning: "#ffff00",
        error: "#ff0000",
      },
    });
    mgr.setTheme("test-unparseable-colors");
    try {
      const { bg, fg } = themeBlendBase();
      expect(bg).toEqual({ r: 0, g: 0, b: 0 });
      expect(fg).toEqual({ r: 255, g: 255, b: 255 });
    } finally {
      mgr.setTheme("default-dark");
    }
  });
});

describe("adjustLightness", () => {
  test("passes non-hex colors through unchanged", () => {
    expect(adjustLightness("rgb(1, 2, 3)", 10)).toBe("rgb(1, 2, 3)");
    expect(adjustLightness("", 10)).toBe("");
  });

  test("passes through nullish input instead of throwing", () => {
    // Regression guard for the `hexColor?.startsWith("#")` optional-chain:
    // some Theme.colors entries (e.g. an undefined `comment`) can flow into
    // adjustLightness via deriveTheme, and it must pass them through as-is.
    expect(adjustLightness(undefined as unknown as string, 10)).toBe(undefined);
  });

  test("expands a shorthand 3-digit hex before adjusting", () => {
    // "#fff" -> "#ffffff", lightened further should still clamp to white.
    expect(adjustLightness("#fff", 10)).toBe("#ffffff");
    // "#000" -> "#000000", darkened stays black.
    expect(adjustLightness("#000", -50)).toBe("#000000");
  });
});

describe("deriveTheme", () => {
  test("copies colors unchanged when adjustLightness isn't given", () => {
    const base: Theme = {
      name: "base",
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
    };
    const derived = deriveTheme(base, "derived", {});
    expect(derived.colors).toEqual(base.colors);
    expect(derived.name).toBe("derived");
  });

  test("skips falsy color values when shifting lightness", () => {
    const base: Theme = {
      name: "base",
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
        comment: "",
      },
    };
    const derived = deriveTheme(base, "derived", { adjustLightness: 10 });
    expect(derived.colors.comment).toBe(""); // falsy value left as-is, not passed to adjustLightness
    expect(derived.colors.primary).not.toBe(base.colors.primary); // truthy values were shifted
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

  test("falls all the way through to surface when both border and panel are omitted", () => {
    const mgr = ThemeManager.getInstance();
    mgr.register({
      name: "test-no-border-no-panel",
      colors: {
        primary: "#111111",
        secondary: "#222222",
        background: "#000000",
        foreground: "#eeeeee",
        surface: "#101010",
        accent: "#333333",
        success: "#00ff00",
        warning: "#ffff00",
        error: "#ff0000",
      } as Theme["colors"],
    });
    const theme = mgr.getTheme("test-no-border-no-panel")!;
    expect(theme.colors.border).toBe("#101010"); // surface, since panel is also absent
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

describe("ThemeManager.getActiveTheme", () => {
  test("falls back to default-dark if the active theme name is somehow unregistered", () => {
    const mgr = ThemeManager.getInstance();
    // Force an invalid active theme name (not reachable through the public API,
    // since setTheme validates registration first).
    (mgr as unknown as { activeThemeName: string }).activeThemeName = "nonexistent-theme";
    try {
      expect(mgr.getActiveTheme().name).toBe("default-dark");
    } finally {
      (mgr as unknown as { activeThemeName: string }).activeThemeName = "default-dark";
    }
  });
});

describe("ThemeManager.setTheme", () => {
  test("ignores an unregistered theme name and warns instead of switching", () => {
    const mgr = ThemeManager.getInstance();
    const before = mgr.getActiveThemeName();
    mgr.setTheme("this-theme-does-not-exist");
    expect(mgr.getActiveThemeName()).toBe(before); // unchanged
  });
});

describe("every light theme's muted text tokens clear WCAG AA", () => {
  // Regression: default-light's placeholder/gutter (#8c959f, 3.04:1),
  // catppuccin-latte's and solarized-light's comment/placeholder/gutter/
  // dimmed (4.37:1, 4.13:1), and gruvbox-light's (3.24:1, plus a
  // catastrophic 1.92:1 for placeholder) all fell under WCAG AA's 4.5:1
  // minimum for normal-size body text against their own background — some
  // barely, one badly. These tokens back visible UI text (help/hint text,
  // input placeholders, disabled state, gutters), not decoration, so they
  // need to actually be readable, not just technically present.
  function relativeLuminance(hex: string): number {
    const lin = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }
  function contrastRatio(a: string, b: string): number {
    const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  const lightThemes = ThemeManager.getInstance()
    .listThemes()
    .filter((t) => isThemeLight(t));
  // Sanity-check the filter itself found the themes this test is meant to
  // guard — an empty list would make every `test.each` below vacuously pass.
  test("finds at least the four known light themes", () => {
    const names = lightThemes.map((t) => t.name);
    for (const n of ["default-light", "catppuccin-latte", "gruvbox-light", "solarized-light"]) {
      expect(names).toContain(n);
    }
  });

  test.each(
    lightThemes.map((t) => [t.name, t] as const),
  )("%s: foreground/comment/placeholder/gutter/dimmed >= 4.5:1 against background", (_name, theme) => {
    for (const key of ["foreground", "comment", "placeholder", "gutter", "dimmed"] as const) {
      const value = theme.colors[key];
      if (!value?.startsWith("#")) continue; // only concrete hex tokens are checked here
      expect(contrastRatio(value, theme.colors.background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  // Regression: default-light's selectionBg (#b6d7fb, 1.49:1), catppuccin-
  // latte's (#acb0be, 1.91:1), and solarized-light's (#eee8d5 — literally
  // its own `surface` value, 1.14:1) were all far under WCAG 1.4.11's 3:1
  // minimum for a non-text UI element — a selection highlight needs to be
  // visibly *there* against the page background, not just contrast the text
  // inside it. gruvbox-light's (3.33:1) already cleared the bar.
  test.each(
    lightThemes.map((t) => [t.name, t] as const),
  )("%s: selectionBg >= 3:1 against background (WCAG 1.4.11 non-text UI)", (_name, theme) => {
    const selectionBg = theme.colors.selectionBg;
    if (!selectionBg?.startsWith("#")) return;
    expect(contrastRatio(selectionBg, theme.colors.background)).toBeGreaterThanOrEqual(3.0);
  });
});
