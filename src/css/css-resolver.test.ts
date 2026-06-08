import { describe, expect, test } from "vitest";
import { adjustLightness, deriveTheme, ThemeManager } from "../core/theme.ts";
import { Widget } from "../dom/widget.ts";
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

    // Test syntax color fallbacks mapped to primary, secondary, warning, accent, etc.
    widget.style.color = "$keyword";
    expect(resolver.resolveStyles(widget, false).color).toBe("#00ffff"); // default-dark primary

    widget.style.color = "$string";
    expect(resolver.resolveStyles(widget, false).color).toBe("#ffeb3b"); // default-dark warning

    widget.style.color = "$number";
    expect(resolver.resolveStyles(widget, false).color).toBe("#ff00ff"); // default-dark accent

    widget.style.color = "$function";
    expect(resolver.resolveStyles(widget, false).color).toBe("#569cd6"); // default-dark secondary

    widget.style.color = "$operator";
    expect(resolver.resolveStyles(widget, false).color).toBe("#ffffff"); // default-dark foreground

    widget.style.color = "$property";
    expect(resolver.resolveStyles(widget, false).color).toBe("#00ffff"); // default-dark primary

    widget.style.color = "$tag";
    expect(resolver.resolveStyles(widget, false).color).toBe("#569cd6"); // default-dark secondary

    // Test diff color fallbacks
    widget.style.color = "$diff-added";
    expect(resolver.resolveStyles(widget, false).color).toBe("#4caf50"); // default-dark success

    widget.style.color = "$diff-removed";
    expect(resolver.resolveStyles(widget, false).color).toBe("#f44336"); // default-dark error

    widget.style.color = "$diff-header";
    expect(resolver.resolveStyles(widget, false).color).toBe("#00ffff"); // default-dark primary

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
    expect(resolver.resolveStyles(widget, false).color).toBe("#00ffff"); // default-dark primary

    widget.style.color = "$selectionBg";
    const selectionBgDark = resolver.resolveStyles(widget, false).color;
    expect(selectionBgDark?.startsWith("#")).toBe(true);

    widget.style.color = "$selectionFg";
    const selectionFgDark = resolver.resolveStyles(widget, false).color;
    expect(selectionFgDark).toBe("#ffffff"); // selectionBg is dark, so foreground is white

    widget.style.color = "$shadow";
    expect(resolver.resolveStyles(widget, false).color).toBe("#000000"); // dark theme shadow is black

    // Default light theme tests
    themeManager.setTheme("default-light");

    widget.style.color = "$border";
    const borderLight = resolver.resolveStyles(widget, false).color;
    expect(borderLight?.startsWith("#")).toBe(true);
    expect(borderLight).not.toBe(borderDark); // different backgrounds

    widget.style.color = "$focus";
    expect(resolver.resolveStyles(widget, false).color).toBe("#0088cc"); // default-light primary

    widget.style.color = "$selectionBg";
    const selectionBgLight = resolver.resolveStyles(widget, false).color;
    expect(selectionBgLight?.startsWith("#")).toBe(true);

    widget.style.color = "$shadow";
    const shadowLight = resolver.resolveStyles(widget, false).color;
    expect(shadowLight?.startsWith("#")).toBe(true);

    themeManager.setTheme("default-dark"); // restore
  });
});
