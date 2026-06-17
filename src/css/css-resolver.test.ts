import { describe, expect, test } from "vitest";
import { motion } from "../anim/motion.ts";
import { Widget } from "../dom/widget.ts";
import { adjustLightness, deriveTheme, ThemeManager } from "../theme.ts";
import { parseTCSS } from "./css-parser.ts";
import { CSSResolver } from "./css-resolver.ts";

describe("CSSResolver Theming and Variables", () => {
  test("TCSS parses top-level variables", () => {
    const rules = parseTCSS(`
      $primary-color: #89b4fa;
      $margin-size: 2;

      button {
        color: $primary-color;
        margin: $margin-size;
      }
    `);
    const variables = rules.variables || {};

    expect(variables["primary-color"]).toBe("#89b4fa");
    expect(variables["margin-size"]).toBe("2");
    expect(rules.length).toBe(1);
    expect(rules[0].properties.color).toBe("$primary-color");
  });

  test("Resolves $name and var(--name) variables", () => {
    const rules = parseTCSS(`
      $color-var: #ff00ff;
      button {
        color: $color-var;
        background: var(--bg-var);
      }
    `);
    const variables = rules.variables || {};

    const resolver = new CSSResolver(rules);
    resolver.addVariables(variables);

    // Register active theme colors
    const themeManager = ThemeManager.getInstance();
    const activeTheme = themeManager.getActiveTheme();
    activeTheme.colors["bg-var"] = "#00ff00";

    const widget = new Widget("button");
    const style = resolver.resolveStyles(widget, false);

    expect(style.color).toBe("#ff00ff");
    expect(style.background).toBe("#00ff00");
  });

  test("Variable lookup precedence (stylesheet overrides theme)", () => {
    const rules = parseTCSS(`
      $shared-var: #stylesheet-val;
      button {
        color: $shared-var;
      }
    `);
    const variables = rules.variables || {};

    const resolver = new CSSResolver(rules);
    resolver.addVariables(variables);

    const themeManager = ThemeManager.getInstance();
    const activeTheme = themeManager.getActiveTheme();
    activeTheme.colors["shared-var"] = "#theme-val";

    const widget = new Widget("button");
    const style = resolver.resolveStyles(widget, false);

    expect(style.color).toBe("#stylesheet-val"); // stylesheet variable has precedence
  });

  test("Dynamic theme switching", () => {
    const themeManager = ThemeManager.getInstance();

    // Switch to Catppuccin Mocha
    themeManager.setTheme("catppuccin-mocha");

    const resolver = new CSSResolver([]);
    const widget = new Widget("button");
    widget.style.color = "$primary";

    let style = resolver.resolveStyles(widget, false);
    expect(style.color).toBe("#cba6f7"); // Mocha primary

    // Switch to Nord
    themeManager.setTheme("nord");
    style = resolver.resolveStyles(widget, false);
    expect(style.color).toBe("#88c0d0"); // Nord primary

    // Restore default
    themeManager.setTheme("default-dark");
  });

  test("Theme derivation and adjustLightness", () => {
    const hex = "#89b4fa"; // blue in Catppuccin
    const lighter = adjustLightness(hex, 20);
    const darker = adjustLightness(hex, -20);

    expect(lighter).not.toBe(hex);
    expect(darker).not.toBe(hex);

    const themeManager = ThemeManager.getInstance();
    const nordTheme = themeManager.getTheme("nord")!;
    const customNord = deriveTheme(nordTheme, "nord-lightened", { adjustLightness: 10 });

    expect(customNord.name).toBe("nord-lightened");
    expect(customNord.colors.primary).toBe(adjustLightness(nordTheme.colors.primary, 10));
  });

  test("Container scoped theme override propagation", () => {
    const themeManager = ThemeManager.getInstance();
    themeManager.setTheme("default-dark");

    const parent = new Widget("vbox");
    parent.theme = "nord";

    const child = new Widget("button");
    child.style.color = "$primary";
    parent.appendChild(child);

    const resolver = new CSSResolver([]);

    // Resolving style for child should pick up parent's nord theme
    const style = resolver.resolveStyles(child, false);
    expect(style.color).toBe("#88c0d0"); // Nord primary instead of cyan (#00ffff)
  });

  test("Dynamic syntax and diff variable fallbacks", () => {
    const resolver = new CSSResolver([]);
    const widget = new Widget("code");

    // Syntax keys defined directly by default-dark resolve from the theme.
    widget.style.color = "$keyword";
    expect(resolver.resolveStyles(widget, false).color).toBe("#c586c0"); // default-dark keyword

    widget.style.color = "$string";
    expect(resolver.resolveStyles(widget, false).color).toBe("#9ece6a"); // default-dark string

    widget.style.color = "$number";
    expect(resolver.resolveStyles(widget, false).color).toBe("#d19a66"); // default-dark number

    widget.style.color = "$function";
    expect(resolver.resolveStyles(widget, false).color).toBe("#4daafc"); // default-dark function

    // Keys the theme leaves undefined fall back to semantic colors.
    widget.style.color = "$operator";
    expect(resolver.resolveStyles(widget, false).color).toBe("#d6d6d6"); // default-dark foreground

    widget.style.color = "$property";
    expect(resolver.resolveStyles(widget, false).color).toBe("#4daafc"); // default-dark primary

    widget.style.color = "$tag";
    expect(resolver.resolveStyles(widget, false).color).toBe("#56b6c2"); // default-dark secondary

    // Test diff color fallbacks
    widget.style.color = "$diff-added";
    expect(resolver.resolveStyles(widget, false).color).toBe("#4ec07a"); // default-dark success

    widget.style.color = "$diff-removed";
    expect(resolver.resolveStyles(widget, false).color).toBe("#e06c75"); // default-dark error

    widget.style.color = "$diff-header";
    expect(resolver.resolveStyles(widget, false).color).toBe("#4daafc"); // default-dark primary

    // Test comment/dimmed blend fallback when undefined in theme
    widget.style.color = "$comment";
    const resolvedComment = resolver.resolveStyles(widget, false).color;
    expect(resolvedComment).toBeDefined();
    expect(resolvedComment?.startsWith("#")).toBe(true);
  });

  test("Dynamic semantic and state variable fallbacks", () => {
    const themeManager = ThemeManager.getInstance();
    const resolver = new CSSResolver([]);
    const widget = new Widget("div");

    // Default dark theme tests
    themeManager.setTheme("default-dark");

    widget.style.color = "$border";
    const borderDark = resolver.resolveStyles(widget, false).color;
    expect(borderDark?.startsWith("#")).toBe(true);

    widget.style.color = "$focus";
    expect(resolver.resolveStyles(widget, false).color).toBe("#4daafc"); // default-dark focus/primary

    widget.style.color = "$selectionBg";
    const selectionBgDark = resolver.resolveStyles(widget, false).color;
    expect(selectionBgDark?.startsWith("#")).toBe(true);

    widget.style.color = "$selectionFg";
    const selectionFgDark = resolver.resolveStyles(widget, false).color;
    expect(selectionFgDark).toBe("#d6d6d6"); // defined by default-dark

    widget.style.color = "$shadow";
    expect(resolver.resolveStyles(widget, false).color).toBe("#000000"); // dark theme shadow is black

    // Default light theme tests
    themeManager.setTheme("default-light");

    widget.style.color = "$border";
    const borderLight = resolver.resolveStyles(widget, false).color;
    expect(borderLight?.startsWith("#")).toBe(true);
    expect(borderLight).not.toBe(borderDark); // different backgrounds

    widget.style.color = "$focus";
    expect(resolver.resolveStyles(widget, false).color).toBe("#0969da"); // default-light focus/primary

    widget.style.color = "$selectionBg";
    const selectionBgLight = resolver.resolveStyles(widget, false).color;
    expect(selectionBgLight?.startsWith("#")).toBe(true);

    widget.style.color = "$shadow";
    const shadowLight = resolver.resolveStyles(widget, false).color;
    expect(shadowLight?.startsWith("#")).toBe(true);

    themeManager.setTheme("default-dark"); // restore
  });
});

describe("CSSResolver value coercion and glow", () => {
  test("coerceValue parses margin/padding shorthand with 1–4 values and rejects junk", () => {
    const resolver = new CSSResolver([]);
    const w = new Widget("div");

    w.style.margin = "2" as never;
    expect(resolver.resolveStyles(w, false).margin).toMatchObject({
      top: 2,
      right: 2,
      bottom: 2,
      left: 2,
    });

    w.style.margin = "1 2" as never;
    expect(resolver.resolveStyles(w, false).margin).toMatchObject({ top: 1, right: 2 });

    w.style.padding = "1 2 3" as never;
    expect(resolver.resolveStyles(w, false).padding).toMatchObject({
      top: 1,
      right: 2,
      bottom: 3,
      left: 2,
    });

    w.style.padding = "1 2 3 4" as never;
    expect(resolver.resolveStyles(w, false).padding).toMatchObject({
      top: 1,
      right: 2,
      bottom: 3,
      left: 4,
    });

    w.style.margin = "nope" as never;
    expect(resolver.resolveStyles(w, false).margin).toBe(0);
  });

  test("coerceValue parses numeric position/size and keeps non-numeric position as-is", () => {
    const resolver = new CSSResolver([]);
    const w = new Widget("div");
    w.style.zIndex = "5" as never;
    w.style.minWidth = "10" as never;
    const s = resolver.resolveStyles(w, false);
    expect(s.zIndex).toBe(5);
    expect(s.minWidth).toBe(10);

    w.style.left = "auto" as never;
    expect(resolver.resolveStyles(w, false).left).toBe("auto"); // NaN -> passthrough
  });

  test("an unresolved variable token is returned unchanged", () => {
    const resolver = new CSSResolver([]);
    const w = new Widget("div");
    expect(resolver.resolveVariable(w, "$totally-unknown")).toBe("$totally-unknown");
    expect(resolver.resolveVariable(w, "var(--also-unknown)")).toBe("var(--also-unknown)");
    expect(resolver.resolveVariable(w, "#abcdef")).toBe("#abcdef"); // fast path, no token
  });

  test("focusGlow/focusGlowPair breathe a hex base when motion is on, and stay static otherwise", () => {
    const resolver = new CSSResolver([]);
    const w = new Widget("button");

    // Motion off: static base + a contrasting text colour.
    motion.set(false);
    expect(resolver.focusGlow(w, "#ff0000")).toBe("#ff0000");
    const offPair = resolver.focusGlowPair(w, "#ff0000");
    expect(offPair.bg).toBe("#ff0000");
    expect(offPair.fg.startsWith("#")).toBe(true);

    // Motion on: a hex base pulses (still a hex), a $var base resolves first,
    // and a non-hex/unresolvable base returns unchanged.
    motion.set(true);
    try {
      // Breathing yields a concrete colour string (hex or rgb()) for a hex base.
      expect(resolver.focusGlow(w, "#ff0000").length).toBeGreaterThan(0);
      expect(resolver.focusGlow(w, "$primary").length).toBeGreaterThan(0);
      expect(resolver.focusGlow(w, "red")).toBe("red"); // non-hex base stays as-is
      const onPair = resolver.focusGlowPair(w, "#00ff00");
      expect(onPair.bg.length).toBeGreaterThan(0);
      expect(onPair.fg.length).toBeGreaterThan(0);
    } finally {
      motion.reset();
    }
  });
});

describe("CSSResolver performance helpers", () => {
  test("hasHoverRules reflects whether any :hover rule is loaded, and recomputes on addRules", () => {
    const plain = new CSSResolver(parseTCSS("button { color: red; }"));
    expect(plain.hasHoverRules()).toBe(false);
    plain.addRules(parseTCSS("button:hover { color: blue; }"));
    expect(plain.hasHoverRules()).toBe(true);

    const withHover = new CSSResolver(parseTCSS("a:hover { color: green; }"));
    expect(withHover.hasHoverRules()).toBe(true);
  });

  test(":hover rules only apply when hovered (selector parsing is cached, not stale)", () => {
    const resolver = new CSSResolver(
      parseTCSS("button { color: #111111; } button:hover { color: #222222; }"),
    );
    const w = new Widget("button");
    // Resolve repeatedly to exercise the parsed-selector cache.
    expect(resolver.resolveStyles(w, false).color).toBe("#111111");
    expect(resolver.resolveStyles(w, true).color).toBe("#222222");
    expect(resolver.resolveStyles(w, false).color).toBe("#111111");
  });
});
