import { afterEach, describe, expect, test } from "vitest";
import { motion } from "../anim/motion.ts";
import { Widget } from "../dom/widget.ts";
import { adjustLightness, deriveTheme, ThemeManager } from "../theme.ts";
import { parseTCSS } from "./css-parser.ts";
import { blendColors, CSSResolver } from "./css-resolver.ts";

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

  test("$disabled doesn't recurse forever when the active theme leaves `dimmed` undefined", () => {
    // Regression: getWidgetColorWithFallback excluded several tokens from its
    // own recursive lookup to prevent a variable resolving back into itself,
    // but "disabled" was missing — even though lookupVariable("disabled")
    // just forwards to lookupVariable("dimmed"), which (when the theme has no
    // `dimmed`) calls back into getWidgetColorWithFallback for the widget's
    // own background/color, re-reading the *same* "$disabled" style value and
    // recursing without end. Every built-in theme happens to define `dimmed`,
    // which is why this went uncaught: reproduce with a custom theme that
    // deliberately omits it.
    const themeManager = ThemeManager.getInstance();
    themeManager.register({
      name: "no-dimmed-test-theme",
      colors: {
        primary: "#4daafc",
        secondary: "#56b6c2",
        background: "#1a1a1a",
        foreground: "#d6d6d6",
        surface: "#242424",
        panel: "#2d2d2d",
        accent: "#c586c0",
        success: "#4ec07a",
        warning: "#e5c07b",
        error: "#e06c75",
        // `dimmed` deliberately omitted.
      },
    });
    themeManager.setTheme("no-dimmed-test-theme");
    try {
      const resolver = new CSSResolver([]);
      const widget = new Widget("div");
      widget.style.color = "$disabled";
      let resolved: string | undefined;
      expect(() => {
        resolved = resolver.resolveStyles(widget, false).color;
      }).not.toThrow();
      expect(resolved?.startsWith("#")).toBe(true);
    } finally {
      themeManager.setTheme("default-dark");
    }
  });

  test("resolveAccent expands a stylesheet alias for $focus/$attention (e.g. $focus: $primary) instead of leaking the raw token", () => {
    // Regression: resolveAccent read stylesheetVariables[name] directly,
    // bypassing resolveVariable's recursive expansion, so it could return the
    // raw "$accent" token verbatim. In the current codebase every real call
    // path happens to re-run the substitution through resolveVariable's own
    // outer loop (which then re-expands the leaked token on its next pass),
    // so this doesn't surface as an observable bug through resolveStyles()
    // today -- but resolveAccent should still return a real color on its own,
    // not rely on a caller's loop to paper over it (e.g. a future/other
    // caller invoking it more directly wouldn't get that safety net).
    const themeManager = ThemeManager.getInstance();
    themeManager.setTheme("default-dark");
    const resolver = new CSSResolver([]);
    resolver.addVariables({ focus: "$accent" });
    const widget = new Widget("div");
    const direct = (
      resolver as unknown as {
        resolveAccent: (w: Widget, name: "focus" | "attention") => string;
      }
    ).resolveAccent(widget, "focus");
    expect(direct).not.toBe("$accent");
    expect(direct.startsWith("#")).toBe(true);
  });

  test("resolveAccent breaks a self/mutually-referential alias cycle instead of recursing forever", () => {
    // Regression: a stylesheet typo like `$focus: $attention; $attention:
    // $focus;` sent resolveAccent -> resolveVariable -> lookupVariable ->
    // resolveAccent in a cycle. resolveVariable's own maxDepth cap doesn't
    // protect this path: each hop is a *fresh* resolveVariable call, so the
    // depth counter never accumulates across the mutual recursion -- it's
    // unbounded call-stack recursion (stack overflow), not the graceful
    // maxDepth fallback every other alias chain gets.
    const themeManager = ThemeManager.getInstance();
    themeManager.setTheme("default-dark");
    const resolver = new CSSResolver([]);
    resolver.addVariables({ focus: "$attention", attention: "$focus" });
    const widget = new Widget("div");
    const direct = (
      resolver as unknown as {
        resolveAccent: (w: Widget, name: "focus" | "attention") => string;
      }
    ).resolveAccent(widget, "focus");
    expect(direct.startsWith("#")).toBe(true);
  });

  test("getWidgetColorWithFallback recognizes a concrete non-hex color instead of silently skipping it", () => {
    // Regression: the ancestor walk only treated a style value as "found"
    // when it started with "#", "$", or "var(" -- a named color ("red") or an
    // rgb()/rgba() literal is a perfectly valid background/color value
    // elsewhere in the codebase, but matched neither branch here, so the walk
    // silently discarded the widget's own explicit color and continued to the
    // parent (or the ultimate default) instead.
    const themeManager = ThemeManager.getInstance();
    themeManager.setTheme("default-dark");
    const resolver = new CSSResolver([]);
    const widget = new Widget("div");
    widget.style.background = "red";
    const found = (
      resolver as unknown as {
        getWidgetColorWithFallback: (
          w: Widget,
          prop: "color" | "background",
          def: string,
        ) => string;
      }
    ).getWidgetColorWithFallback(widget, "background", "#unused-default");
    expect(found).toBe("red");
  });
});

describe("CSSResolver syntax/diff fallbacks for theme-undefined names", () => {
  test("builtin/type/boolean/regex/punctuation and diff row tints resolve to a colour", () => {
    const themeManager = ThemeManager.getInstance();
    themeManager.setTheme("default-dark");
    const resolver = new CSSResolver([]);
    const w = new Widget("code");
    // These names are NOT defined directly by default-dark, so each falls
    // through to its semantic base (primary/warning/dimmed/…).
    for (const name of [
      "builtin",
      "type",
      "boolean",
      "regex",
      "attr-name",
      "regexp",
      "punctuation",
      "diff-added-bg",
      "diff-removed-bg",
      "diff-added-fg",
      "diff-removed-fg",
      "diff-added-gutter-bg",
      "diff-removed-gutter-bg",
      "diff-added-gutter-fg",
      "diff-removed-gutter-fg",
    ]) {
      w.style.color = `$${name}`;
      const c = resolver.resolveStyles(w, false).color;
      expect(typeof c === "string" && c.length > 0).toBe(true);
    }
    themeManager.setTheme("default-dark");
  });
});

describe("CSSResolver diff row tint strength", () => {
  // Regression: the row tint used to blend in only 16%/24% (light/dark) of
  // the success/error color — a wash so subtle it read as barely-there,
  // especially on light themes where the same blend weight lands visually
  // weaker against a near-white background. Verified with a real luminance-
  // contrast measurement (WCAG relative luminance) rather than eyeballing,
  // since "looks washed" is otherwise unfalsifiable.
  //
  // Dark and light intentionally target different floors: dark's weight
  // (30%) trades some background-distinguishability for keeping text-on-tint
  // contrast high (going further, to 40%, measurably cost ~2:1 of foreground
  // legibility for a distinguishability gain most users don't need as much
  // as the text staying easy to read) — light's (42%) doesn't have that
  // tradeoff to the same degree since it starts from a much lower base.
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

  afterEach(() => ThemeManager.getInstance().setTheme("default-dark"));

  test.each([
    ["default-dark", 1.3, 4.5] as const,
    ["default-light", 1.4, 4.5] as const,
  ])("%s: diff-added-bg/diff-removed-bg are distinguishable from the background, and the row's own text color stays legible on top", (themeName, minBgContrast, minTextContrast) => {
    const mgr = ThemeManager.getInstance();
    mgr.setTheme(themeName);
    const resolver = new CSSResolver([]);
    const w = new Widget("code");
    const theme = mgr.getActiveTheme();
    const bg = theme.colors.background;

    w.style.color = "$diff-added-bg";
    const addedBg = resolver.resolveStyles(w, false).color as string;
    w.style.color = "$diff-removed-bg";
    const removedBg = resolver.resolveStyles(w, false).color as string;
    // Diff.ts paints an added/removed row's text with diff-added-fg/
    // diff-removed-fg, not the plain theme foreground — check the color
    // that's actually rendered, not a stand-in.
    w.style.color = "$diff-added-fg";
    const addedFg = resolver.resolveStyles(w, false).color as string;
    w.style.color = "$diff-removed-fg";
    const removedFg = resolver.resolveStyles(w, false).color as string;

    // The pre-fix weights (16%/24%) produced ~1.2-1.6:1 against the page
    // background on every built-in theme — below this floor. This isn't a
    // WCAG text-contrast target (a background wash isn't text), just a
    // "not literally the same shade as the page" floor.
    expect(contrastRatio(addedBg, bg)).toBeGreaterThan(minBgContrast);
    expect(contrastRatio(removedBg, bg)).toBeGreaterThan(minBgContrast);
    // The row's own text color painted over its own tint must stay clearly
    // legible — this is what regresses if either tint is pushed too far.
    expect(contrastRatio(addedFg, addedBg)).toBeGreaterThan(minTextContrast);
    expect(contrastRatio(removedFg, removedBg)).toBeGreaterThan(minTextContrast);
  });

  test.each([
    "default-dark",
    "default-light",
  ])("%s: diff-added-fg/diff-removed-fg read as a distinct hue from the plain theme foreground, not just a same-color restyle", (themeName) => {
    // Regression: an added/removed row's text used to be the same plain
    // theme foreground as every other line — only the background tint
    // signaled the change. diff-added-fg/diff-removed-fg must actually
    // differ from the foreground (blended toward success/error), or this
    // whole feature is a no-op.
    const mgr = ThemeManager.getInstance();
    mgr.setTheme(themeName);
    const resolver = new CSSResolver([]);
    const w = new Widget("code");
    const fg = mgr.getActiveTheme().colors.foreground;

    w.style.color = "$diff-added-fg";
    const addedFg = resolver.resolveStyles(w, false).color as string;
    w.style.color = "$diff-removed-fg";
    const removedFg = resolver.resolveStyles(w, false).color as string;

    expect(addedFg).not.toBe(fg);
    expect(removedFg).not.toBe(fg);
    expect(addedFg).not.toBe(removedFg);
  });

  test.each([
    "default-dark",
    "default-light",
  ])("%s: the gutter tint is brighter than the code-area tint, and its text clears AA on top", (themeName) => {
    const mgr = ThemeManager.getInstance();
    mgr.setTheme(themeName);
    const resolver = new CSSResolver([]);
    const w = new Widget("code");
    const theme = mgr.getActiveTheme();
    const bg = theme.colors.background;

    w.style.color = "$diff-added-bg";
    const codeBg = resolver.resolveStyles(w, false).color as string;
    w.style.color = "$diff-added-gutter-bg";
    const gutterBg = resolver.resolveStyles(w, false).color as string;
    w.style.color = "$diff-added-gutter-fg";
    const gutterFg = resolver.resolveStyles(w, false).color as string;

    // "Brighter" = further from the page background than the code area's
    // own (now intentionally darker) tint.
    expect(contrastRatio(gutterBg, bg)).toBeGreaterThan(contrastRatio(codeBg, bg));
    expect(contrastRatio(gutterFg, gutterBg)).toBeGreaterThan(4.5);
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

  test("an unparseable minWidth/minHeight/maxWidth/maxHeight doesn't poison layout with NaN", () => {
    // Regression: unlike margin/padding (fall back to 0) and left/right/top/
    // bottom/zIndex (fall back to the raw string), these four keys had no
    // NaN guard at all — a keyword-like value ("auto") produced a bare NaN,
    // which then poisons Math.max(measuredWidth, NaN)/Math.min(..., NaN) in
    // widget.ts permanently (NaN propagates through every subsequent layout).
    const resolver = new CSSResolver([]);
    const w = new Widget("div");
    w.style.minWidth = "auto" as never;
    w.style.maxWidth = "auto" as never;
    w.style.minHeight = "auto" as never;
    w.style.maxHeight = "auto" as never;
    const s = resolver.resolveStyles(w, false);
    expect(s.minWidth).toBeUndefined();
    expect(s.maxWidth).toBeUndefined();
    expect(s.minHeight).toBeUndefined();
    expect(s.maxHeight).toBeUndefined();
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

  test(":disabled only applies to a disabled widget", () => {
    const resolver = new CSSResolver(
      parseTCSS("button { color: #111111; } button:disabled { color: #999999; }"),
    );
    const w = new Widget("button");
    expect(resolver.resolveStyles(w, false).color).toBe("#111111");
    w.disabled = true;
    expect(resolver.resolveStyles(w, false).color).toBe("#999999");
  });

  test(":checked only applies to a widget whose `checked` field is true", () => {
    const resolver = new CSSResolver(
      parseTCSS("checkbox { color: #111111; } checkbox:checked { color: #00ff00; }"),
    );
    const w = new Widget("checkbox") as Widget & { checked?: boolean };
    // No `checked` field at all: :checked must not match.
    expect(resolver.resolveStyles(w, false).color).toBe("#111111");
    w.checked = false;
    expect(resolver.resolveStyles(w, false).color).toBe("#111111");
    w.checked = true;
    expect(resolver.resolveStyles(w, false).color).toBe("#00ff00");
  });

  test("an unrecognized pseudo-class fails closed instead of matching unconditionally", () => {
    // Regression test: :checked/:disabled/:active etc. used to have no gate
    // at all, so any pseudo-class other than :hover/:focus silently applied
    // to every matching widget regardless of state.
    const resolver = new CSSResolver(
      parseTCSS("button { color: #111111; } button:active { color: #ff0000; }"),
    );
    const w = new Widget("button");
    expect(resolver.resolveStyles(w, false).color).toBe("#111111");
  });

  test("chained pseudo-classes require every one of them to match, not just the first", () => {
    // Regression: parseSelector only kept parts[1] as `pseudo`, discarding a
    // second (or later) chained pseudo-class entirely — "button:focus:hover"
    // was parsed as pseudo="focus" alone, matching on focus regardless of
    // hover state.
    const resolver = new CSSResolver(
      parseTCSS("button { color: #111111; } button:focus:hover { color: #ff00ff; }"),
    );
    const w = new Widget("button");
    expect(resolver.resolveStyles(w, false).color).toBe("#111111"); // neither
    w.focused = true;
    expect(resolver.resolveStyles(w, false).color).toBe("#111111"); // focus only
    expect(resolver.resolveStyles(w, true).color).toBe("#ff00ff"); // both
    w.focused = false;
    expect(resolver.resolveStyles(w, true).color).toBe("#111111"); // hover only
  });

  test("hasHoverRules detects :hover even when chained after another pseudo-class", () => {
    const resolver = new CSSResolver(parseTCSS("button:focus:hover { color: #ff00ff; }"));
    expect(resolver.hasHoverRules()).toBe(true);
  });

  test("a comma-separated grouped selector styles every part of the group", () => {
    // Regression: parseTCSS never split a grouped selector ("h1, h2 { ... }")
    // on its top-level commas, so the leftover ", " in the single selector
    // string could never fully-consume-match any widget — the rule silently
    // styled nothing at all.
    const rules = parseTCSS("label, box { color: #00ff00; }");
    expect(rules.length).toBe(2);
    expect(rules.map((r) => r.selector)).toEqual(["label", "box"]);

    const resolver = new CSSResolver(rules);
    expect(resolver.resolveStyles(new Widget("label"), false).color).toBe("#00ff00");
    expect(resolver.resolveStyles(new Widget("box"), false).color).toBe("#00ff00");
  });
});

describe("blendColors", () => {
  test("returns neutral gray when either input is missing or non-hex", () => {
    expect(blendColors("", "#ffffff")).toBe("#808080");
    expect(blendColors("#ffffff", "")).toBe("#808080");
    expect(blendColors("red", "#ffffff")).toBe("#808080");
    expect(blendColors("#ffffff", "blue")).toBe("#808080");
  });

  test("expands 3-digit hex shorthand for both colors", () => {
    // #f00 -> #ff0000, #0f0 -> #00ff00; an even blend averages each channel.
    expect(blendColors("#f00", "#0f0", 0.5)).toBe("#808000");
  });
});

describe("CSSResolver additional branch coverage", () => {
  test("addRules re-applies variables carried on the new rule set", () => {
    const resolver = new CSSResolver([]);
    const rules = parseTCSS("$late-var: #123456; div { color: $late-var; }");
    resolver.addRules(rules);
    const w = new Widget("div");
    expect(resolver.resolveStyles(w, false).color).toBe("#123456");
  });

  test("addRules with a plain array (no .variables property) doesn't throw", () => {
    const resolver = new CSSResolver([]);
    resolver.addRules([{ selector: "div", properties: { color: "#654321" } }]);
    const w = new Widget("div");
    expect(resolver.resolveStyles(w, false).color).toBe("#654321");
  });

  test("resolveAccent falls back to its hardcoded default when the theme defines neither the accent nor its sibling", () => {
    const themeManager = ThemeManager.getInstance();
    themeManager.register({
      name: "no-accent-test-theme",
      colors: {
        secondary: "#56b6c2",
        background: "#1a1a1a",
        foreground: "#d6d6d6",
        surface: "#242424",
        panel: "#2d2d2d",
        accent: "#c586c0",
        success: "#4ec07a",
        error: "#e06c75",
        // primary and warning deliberately omitted.
      } as never,
    });
    themeManager.setTheme("no-accent-test-theme");
    try {
      motion.set(false);
      const resolver = new CSSResolver([]);
      const widget = new Widget("div");
      const accessor = resolver as unknown as {
        resolveAccent: (w: Widget, name: "focus" | "attention") => string;
      };
      expect(accessor.resolveAccent(widget, "focus")).toBe("#4daafc");
      expect(accessor.resolveAccent(widget, "attention")).toBe("#e5c07b");
    } finally {
      motion.reset();
      themeManager.setTheme("default-dark");
    }
  });

  test("resolveAccent breaks the cycle starting from 'attention' too", () => {
    const themeManager = ThemeManager.getInstance();
    themeManager.setTheme("default-dark");
    const resolver = new CSSResolver([]);
    resolver.addVariables({ focus: "$attention", attention: "$focus" });
    const widget = new Widget("div");
    const direct = (
      resolver as unknown as {
        resolveAccent: (w: Widget, name: "focus" | "attention") => string;
      }
    ).resolveAccent(widget, "attention");
    expect(direct.startsWith("#")).toBe(true);
  });

  test("getWidgetColorWithFallback returns a hex value directly without walking further", () => {
    const themeManager = ThemeManager.getInstance();
    themeManager.setTheme("default-dark");
    const resolver = new CSSResolver([]);
    const widget = new Widget("div");
    widget.style.background = "#abcdef";
    const found = (
      resolver as unknown as {
        getWidgetColorWithFallback: (
          w: Widget,
          prop: "color" | "background",
          def: string,
        ) => string;
      }
    ).getWidgetColorWithFallback(widget, "background", "#unused");
    expect(found).toBe("#abcdef");
  });

  test("getWidgetColorWithFallback resolves a var(--name) style value", () => {
    const themeManager = ThemeManager.getInstance();
    themeManager.setTheme("default-dark");
    const resolver = new CSSResolver([]);
    resolver.addVariables({ "my-bg": "#123123" });
    const widget = new Widget("div");
    widget.style.background = "var(--my-bg)";
    const found = (
      resolver as unknown as {
        getWidgetColorWithFallback: (
          w: Widget,
          prop: "color" | "background",
          def: string,
        ) => string;
      }
    ).getWidgetColorWithFallback(widget, "background", "#unused");
    expect(found).toBe("#123123");
  });

  test("semantic/diff/selection fallbacks work even when the theme omits background, foreground, success, and error", () => {
    // Every built-in theme happens to define background/foreground/success/
    // error, which masks the `|| "#fallback"` defaults in lookupVariable and
    // getWidgetColorWithFallback's callers. Register a deliberately sparse
    // theme so those fallback branches actually run.
    const themeManager = ThemeManager.getInstance();
    themeManager.register({
      name: "sparse-test-theme",
      colors: {
        primary: "#4daafc",
        secondary: "#56b6c2",
        surface: "#242424",
        panel: "#2d2d2d",
        accent: "#c586c0",
        warning: "#e5c07b",
        // background, foreground, success, error deliberately omitted.
      } as never,
    });
    themeManager.setTheme("sparse-test-theme");
    try {
      const resolver = new CSSResolver([]);
      const w = new Widget("div");

      w.style.color = "$border";
      expect(resolver.resolveStyles(w, false).color?.startsWith("#")).toBe(true);

      w.style.color = "$selectionBg";
      expect(resolver.resolveStyles(w, false).color?.startsWith("#")).toBe(true);

      w.style.color = "$selectionFg";
      expect(typeof resolver.resolveStyles(w, false).color).toBe("string");

      w.style.color = "$shadow";
      expect(typeof resolver.resolveStyles(w, false).color).toBe("string");

      w.style.color = "$diff-added";
      expect(resolver.resolveStyles(w, false).color).toBe("bright-green");

      w.style.color = "$diff-removed";
      expect(resolver.resolveStyles(w, false).color).toBe("bright-red");

      w.style.color = "$diff-added-bg";
      expect(resolver.resolveStyles(w, false).color?.startsWith("#")).toBe(true);
    } finally {
      themeManager.setTheme("default-dark");
    }
  });

  test("a non-boolean 'checked' field does not satisfy :checked", () => {
    const resolver = new CSSResolver(
      parseTCSS("checkbox { color: #111111; } checkbox:checked { color: #00ff00; }"),
    );
    const w = new Widget("checkbox") as Widget & { checked?: unknown };
    w.checked = "yes"; // truthy but not a boolean
    expect(resolver.resolveStyles(w, false).color).toBe("#111111");
  });

  test("coerceValue parses valid numeric top/right/bottom values", () => {
    const resolver = new CSSResolver([]);
    const w = new Widget("div");
    w.style.top = "3" as never;
    w.style.right = "4" as never;
    w.style.bottom = "5" as never;
    const s = resolver.resolveStyles(w, false);
    expect(s.top).toBe(3);
    expect(s.right).toBe(4);
    expect(s.bottom).toBe(5);
  });

  test("focusGlow/focusGlowPair use the light-theme contrast pole when motion is on", () => {
    const themeManager = ThemeManager.getInstance();
    themeManager.setTheme("default-light");
    const resolver = new CSSResolver([]);
    const w = new Widget("button");
    motion.set(true);
    try {
      expect(resolver.focusGlow(w, "#ff0000").length).toBeGreaterThan(0);
      const pair = resolver.focusGlowPair(w, "#00ff00");
      expect(pair.bg.length).toBeGreaterThan(0);
      expect(pair.fg.length).toBeGreaterThan(0);
    } finally {
      motion.reset();
      themeManager.setTheme("default-dark");
    }
  });

  test("number/function/operator/property/tag syntax names fall through to their semantic base when the theme omits them directly", () => {
    const themeManager = ThemeManager.getInstance();
    themeManager.register({
      name: "no-syntax-test-theme",
      colors: {
        primary: "#4daafc",
        secondary: "#56b6c2",
        accent: "#c586c0",
        foreground: "#d6d6d6",
        background: "#1a1a1a",
        surface: "#242424",
        panel: "#2d2d2d",
        // number/function/operator/property/tag deliberately omitted so
        // lookupVariable falls through to accent/secondary/foreground/primary.
      } as never,
    });
    themeManager.setTheme("no-syntax-test-theme");
    try {
      const resolver = new CSSResolver([]);
      const w = new Widget("code");
      for (const name of ["number", "function", "operator", "property", "tag"]) {
        w.style.color = `$${name}`;
        const c = resolver.resolveStyles(w, false).color;
        expect(typeof c === "string" && c.length > 0).toBe(true);
      }
    } finally {
      themeManager.setTheme("default-dark");
    }
  });

  test("diff-added/diff-removed/diff-header resolve directly from theme success/error/primary when defined", () => {
    const themeManager = ThemeManager.getInstance();
    themeManager.setTheme("default-dark");
    const resolver = new CSSResolver([]);
    const w = new Widget("code");
    w.style.color = "$diff-added";
    expect(resolver.resolveStyles(w, false).color).toBe("#4ec07a");
    w.style.color = "$diff-removed";
    expect(resolver.resolveStyles(w, false).color).toBe("#e06c75");
    w.style.color = "$diff-header";
    expect(resolver.resolveStyles(w, false).color).toBe("#4daafc");
  });

  test("calculateSpecificity handles empty selector, tag-less remainder, and id/class combos", () => {
    const resolver = new CSSResolver([]);
    const accessor = resolver as unknown as {
      calculateSpecificity: (base: string, pseudos: string[]) => number;
    };
    expect(accessor.calculateSpecificity("", [])).toBe(0);
    // Starts with neither '#' nor '.' and has no leading tag name to match.
    expect(accessor.calculateSpecificity("*", [])).toBe(0);
    expect(accessor.calculateSpecificity("#my-id", [])).toBe(100);
    expect(accessor.calculateSpecificity(".my-class", [])).toBe(10);
    expect(accessor.calculateSpecificity("div#my-id.my-class", ["hover"])).toBe(121);
  });

  test("pseudoMatches fails closed for an unsupported pseudo-class", () => {
    const resolver = new CSSResolver([]);
    const accessor = resolver as unknown as {
      pseudoMatches: (pseudo: string | undefined, w: Widget, isHovered: boolean) => boolean;
    };
    const w = new Widget("div");
    expect(accessor.pseudoMatches("visited", w, false)).toBe(false);
  });

  test("resolveStyles tolerates a widget with no defaultStyle and skips undefined default entries", () => {
    const resolver = new CSSResolver([]);
    const w = new Widget("div");
    (w as unknown as { defaultStyle: unknown }).defaultStyle = undefined;
    expect(() => resolver.resolveStyles(w, false)).not.toThrow();

    const w2 = new Widget("div");
    w2.defaultStyle.color = undefined;
    const s = resolver.resolveStyles(w2, false);
    expect(s.color).toBeUndefined();
  });

  test("coerceValue falls back to 0 for margin/padding shorthand with an unsupported value count", () => {
    const resolver = new CSSResolver([]);
    const w = new Widget("div");
    w.style.margin = "1 2 3 4 5" as never;
    expect(resolver.resolveStyles(w, false).margin).toBe(0);
  });

  test("diff-added/diff-header/diff-added-bg fall back to hardcoded colors on a light theme missing success/primary", () => {
    const themeManager = ThemeManager.getInstance();
    themeManager.register({
      name: "light-no-semantic-test-theme",
      colors: {
        background: "#ffffff",
        foreground: "#111111",
        secondary: "#56b6c2",
        accent: "#c586c0",
        surface: "#f5f5f5",
        panel: "#eeeeee",
        // primary/success/error deliberately omitted.
      } as never,
    });
    themeManager.setTheme("light-no-semantic-test-theme");
    try {
      const resolver = new CSSResolver([]);
      const w = new Widget("code");

      w.style.color = "$diff-added";
      expect(resolver.resolveStyles(w, false).color).toBe("green");

      w.style.color = "$diff-removed";
      expect(resolver.resolveStyles(w, false).color).toBe("red");

      w.style.color = "$diff-header";
      expect(resolver.resolveStyles(w, false).color).toBe("cyan");

      w.style.color = "$diff-added-bg";
      expect(resolver.resolveStyles(w, false).color?.startsWith("#")).toBe(true);

      w.style.color = "$diff-removed-bg";
      expect(resolver.resolveStyles(w, false).color?.startsWith("#")).toBe(true);
    } finally {
      themeManager.setTheme("default-dark");
    }
  });

  test("resolveStyles resolves a matched stylesheet rule whose property value isn't a string", () => {
    const resolver = new CSSResolver([]);
    resolver.addRules([
      { selector: "div", properties: { zIndex: 5 } as unknown as Record<string, string> },
    ]);
    const w = new Widget("div");
    expect(resolver.resolveStyles(w, false).zIndex).toBe(5);
  });

  test("resolveStyles tolerates a widget with no inline style object", () => {
    const resolver = new CSSResolver([]);
    const w = new Widget("div");
    (w as unknown as { style: unknown }).style = undefined;
    expect(() => resolver.resolveStyles(w, false)).not.toThrow();
  });
});
