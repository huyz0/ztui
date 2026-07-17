import { ATTENTION_BREATH, breatheColor, breatheIntensity, FOCUS_BREATH } from "../anim/breathe.ts";
import { motion } from "../anim/motion.ts";
import type { WidgetStyles } from "../dom/widget.ts";
import { Widget } from "../dom/widget.ts";
import { Spacing } from "../geometry/spacing.ts";
import { contrastText, lerpColor, mix, parseRgb, rgbStr } from "../render/color.ts";
import { isColorLight, isThemeLight, ThemeManager } from "../theme.ts";
import type { CSSRule } from "./css-parser.ts";

export function blendColors(color1: string, color2: string, weight = 0.5): string {
  if (!color1 || !color2) return "#808080";
  if (!color1.startsWith("#") || !color2.startsWith("#")) {
    return "#808080";
  }
  const hex1 = color1.slice(1);
  const hex2 = color2.slice(1);

  let r1 = 0,
    g1 = 0,
    b1 = 0;
  if (hex1.length === 3) {
    r1 = Number.parseInt(hex1[0] + hex1[0], 16);
    g1 = Number.parseInt(hex1[1] + hex1[1], 16);
    b1 = Number.parseInt(hex1[2] + hex1[2], 16);
  } else {
    r1 = Number.parseInt(hex1.slice(0, 2), 16);
    g1 = Number.parseInt(hex1.slice(2, 4), 16);
    b1 = Number.parseInt(hex1.slice(4, 6), 16);
  }

  let r2 = 0,
    g2 = 0,
    b2 = 0;
  if (hex2.length === 3) {
    r2 = Number.parseInt(hex2[0] + hex2[0], 16);
    g2 = Number.parseInt(hex2[1] + hex2[1], 16);
    b2 = Number.parseInt(hex2[2] + hex2[2], 16);
  } else {
    r2 = Number.parseInt(hex2.slice(0, 2), 16);
    g2 = Number.parseInt(hex2.slice(2, 4), 16);
    b2 = Number.parseInt(hex2.slice(4, 6), 16);
  }

  const r = Math.round(r1 * weight + r2 * (1 - weight));
  const g = Math.round(g1 * weight + g2 * (1 - weight));
  const b = Math.round(b1 * weight + b2 * (1 - weight));

  const toHex = (c: number) => c.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export class CSSResolver {
  private rules: CSSRule[] = [];
  private stylesheetVariables: Record<string, string> = {};
  // Parsed-selector cache: `parseSelector` runs once per rule per widget per
  // frame, so memoizing the split keeps re-styling from re-parsing the same
  // strings thousands of times.
  private selectorCache = new Map<string, { base: string; pseudos: string[] }>();
  // Whether any rule carries a `:hover` pseudo — lets the app skip a full
  // relayout on pointer hover changes when nothing visual depends on hover.
  private _hasHoverRules: boolean | null = null;
  // Names currently being resolved by resolveAccent, on the current call
  // stack — guards against a self/mutually-referential alias (e.g.
  // `$focus: $attention; $attention: $focus;`) recursing forever. Unlike
  // resolveVariable's own maxDepth cap, this recursion re-enters through a
  // fresh resolveVariable call each time, so that cap never accumulates.
  private resolvingAccents = new Set<string>();

  constructor(rules: CSSRule[] = []) {
    this.rules = rules;
    if (rules && "variables" in rules && rules.variables) {
      this.addVariables(rules.variables as Record<string, string>);
    }
  }

  public addRules(rules: CSSRule[]): void {
    this.rules.push(...rules);
    this._hasHoverRules = null;
    if (rules && "variables" in rules && rules.variables) {
      this.addVariables(rules.variables as Record<string, string>);
    }
  }

  /** True when any TCSS rule is loaded (a stylesheet was applied via `loadStyles`). */
  public hasRules(): boolean {
    return this.rules.length > 0;
  }

  /** True when any loaded rule uses `:hover` (cached; recomputed when rules change). */
  public hasHoverRules(): boolean {
    if (this._hasHoverRules === null) {
      this._hasHoverRules = this.rules.some((r) =>
        this.parseSelector(r.selector).pseudos.includes("hover"),
      );
    }
    return this._hasHoverRules;
  }

  public addVariables(variables: Record<string, string>): void {
    Object.assign(this.stylesheetVariables, variables);
  }

  public getActiveThemeForWidget(widget: Widget) {
    let current: any = widget;
    while (current) {
      if (current.theme) {
        const t = ThemeManager.getInstance().getTheme(current.theme);
        if (t) return t;
      }
      current = current.parent;
    }
    return ThemeManager.getInstance().getActiveTheme();
  }

  public resolveVariable(widget: Widget, value: string): string {
    // Fast path: the vast majority of style values are concrete colors/dimensions
    // (`#1e1e2e`, `10`, `rounded`, …) with no token to expand. Skip the two
    // global regex passes entirely unless a `$name` or `var(--name)` is present —
    // this runs for every style value of every widget on every frame.
    if (!value.includes("$") && !value.includes("var(")) return value;

    let resolved = value;
    let depth = 0;
    const maxDepth = 10;

    while (depth < maxDepth) {
      let changed = false;

      // Resolve var(--name)
      resolved = resolved.replace(/var\(--([a-zA-Z0-9_-]+)\)/g, (match, name) => {
        const val = this.lookupVariable(widget, name);
        if (val !== undefined && val !== match) {
          changed = true;
          return val;
        }
        return match;
      });

      // Resolve $name
      resolved = resolved.replace(/\$([a-zA-Z0-9_-]+)/g, (match, name) => {
        const val = this.lookupVariable(widget, name);
        if (val !== undefined && val !== match) {
          changed = true;
          return val;
        }
        return match;
      });

      if (!changed) break;
      depth++;
    }

    return resolved;
  }

  /**
   * Resolve a breathing accent (`focus` or `attention`). The base colour is the
   * theme's own `focus`/`attention` (or a sensible sibling — primary for focus,
   * warning for attention), and when motion is enabled it gently oscillates
   * toward a lighter/richer tint. With motion off it returns the static base, so
   * the look and colour assertions stay deterministic.
   */
  private resolveAccent(widget: Widget, name: "focus" | "attention"): string {
    // Break a self/mutually-referential alias cycle (e.g. a stylesheet typo
    // like `$focus: $attention; $attention: $focus;`) instead of recursing
    // through resolveVariable -> lookupVariable -> resolveAccent forever.
    if (this.resolvingAccents.has(name)) {
      return name === "focus" ? "#4daafc" : "#e5c07b";
    }
    this.resolvingAccents.add(name);
    try {
      const activeTheme = this.getActiveThemeForWidget(widget);
      const isLight = activeTheme ? isThemeLight(activeTheme) : false;
      const rawThemed = this.stylesheetVariables[name] ?? activeTheme?.colors?.[name];
      // A stylesheet/theme value can itself be an alias (e.g. `$focus: $primary;`)
      // — expand it through the normal variable machinery rather than using the
      // raw `$name`/`var(--name)` token verbatim as a colour.
      const themed =
        rawThemed && (rawThemed.startsWith("$") || rawThemed.startsWith("var("))
          ? this.resolveVariable(widget, rawThemed)
          : rawThemed;
      // Breathe toward a pole, not a lighter tint: lightening an already-bright
      // accent is imperceptible, whereas blending toward white (dark themes) or
      // black (light themes) reads as a clear glow. The contrast pole flips with
      // theme polarity so the pulse is always visible.
      const pole = isLight ? "#000000" : "#ffffff";

      if (name === "focus") {
        const base = themed || activeTheme?.colors?.primary || "#4daafc";
        if (!motion.enabled || !base.startsWith("#")) return base;
        return breatheColor(base, pole, Date.now(), FOCUS_BREATH);
      }
      // attention — warmer/louder than focus.
      const base =
        themed || activeTheme?.colors?.warning || activeTheme?.colors?.primary || "#e5c07b";
      if (!motion.enabled || !base.startsWith("#")) return base;
      return breatheColor(base, pole, Date.now(), ATTENTION_BREATH);
    } finally {
      this.resolvingAccents.delete(name);
    }
  }

  /**
   * Make an arbitrary base colour *glow* with the focus breath: it pulses from
   * the base toward the theme's contrast pole and back, so a control can breathe
   * its **own** colour (a red button glows red, a green one green) rather than a
   * generic accent. `base` may be a `$var`/`var(--…)` or a concrete colour.
   * Returns the static base when motion is off or the colour isn't a hex.
   */
  public focusGlow(widget: Widget, base: string): string {
    const resolved =
      base.startsWith("$") || base.startsWith("var(") ? this.resolveVariable(widget, base) : base;
    if (!motion.enabled || !resolved.startsWith("#")) return resolved;
    const activeTheme = this.getActiveThemeForWidget(widget);
    const isLight = activeTheme ? isThemeLight(activeTheme) : false;
    const pole = isLight ? "#000000" : "#ffffff";
    return breatheColor(resolved, pole, Date.now(), FOCUS_BREATH);
  }

  /**
   * Like {@link focusGlow} but also returns a text colour that transitions in
   * lockstep with the glow: as the background eases from the base toward the
   * pole, the text eases between the contrast colour of the base and that of the
   * crest — so dark→light backgrounds give light→dark text *smoothly*, never a
   * hard flip at a luminance threshold (the same trick the smooth caret uses).
   */
  public focusGlowPair(widget: Widget, base: string): { bg: string; fg: string } {
    const resolved =
      base.startsWith("$") || base.startsWith("var(") ? this.resolveVariable(widget, base) : base;
    const baseRgb = parseRgb(resolved);
    if (!motion.enabled || !baseRgb) {
      return { bg: resolved, fg: contrastText(resolved) };
    }
    const activeTheme = this.getActiveThemeForWidget(widget);
    const isLight = activeTheme ? isThemeLight(activeTheme) : false;
    const pole = isLight ? "#000000" : "#ffffff";
    const poleRgb = parseRgb(pole) ?? { r: 255, g: 255, b: 255 };
    const now = Date.now();

    const bg = breatheColor(resolved, pole, now, FOCUS_BREATH);
    // The text endpoints: what contrasts the trough (base) vs the crest (base
    // blended its peak amount toward the pole). Interpolating between them by the
    // same breathing intensity keeps fg perfectly synced to bg.
    const crestBg = rgbStr(mix(baseRgb, poleRgb, FOCUS_BREATH.amplitude));
    const fg = lerpColor(
      contrastText(resolved),
      contrastText(crestBg),
      breatheIntensity(now, FOCUS_BREATH.periodMs),
    );
    return { bg, fg };
  }

  private getWidgetColorWithFallback(
    widget: Widget,
    property: "color" | "background",
    defaultVal: string,
  ): string {
    let current: Widget | null = widget;
    while (current) {
      const styleVal = current.style?.[property] || current.defaultStyle?.[property];
      if (styleVal !== undefined) {
        if (styleVal.startsWith("#")) {
          return styleVal;
        }
        if (styleVal.startsWith("$") || styleVal.startsWith("var(")) {
          const varName = styleVal.startsWith("$")
            ? styleVal.slice(1)
            : styleVal.match(/var\(--([a-zA-Z0-9_-]+)\)/)?.[1];
          if (
            varName &&
            varName !== "comment" &&
            varName !== "placeholder" &&
            varName !== "gutter" &&
            varName !== "dimmed" &&
            // "disabled" forwards to "dimmed" in lookupVariable when a theme
            // doesn't define its own — which itself calls back into this
            // method for "background"/"color" on the same widget, re-reading
            // a "$disabled" style value and recursing forever if "disabled"
            // isn't excluded here too (only every theme happening to define
            // `dimmed` masked this).
            varName !== "disabled" &&
            varName !== "keyword" &&
            varName !== "string" &&
            varName !== "number" &&
            varName !== "function" &&
            varName !== "border" &&
            varName !== "focus" &&
            varName !== "selectionBg" &&
            varName !== "selectionFg" &&
            varName !== "shadow"
          ) {
            const resolved = this.lookupVariable(current, varName);
            if (resolved?.startsWith("#")) {
              return resolved;
            }
          }
        } else {
          // A concrete non-hex color (a named color like "red", an
          // rgb()/rgba() literal, an ANSI name like "bright-blue", …) is a
          // perfectly valid style value elsewhere in the codebase. Previously
          // neither branch above matched it, so it was silently discarded —
          // the walk moved on to the parent instead of using the widget's own
          // explicit color.
          return styleVal;
        }
      }
      current = current.parent && current.parent instanceof Widget ? current.parent : null;
    }
    return defaultVal;
  }

  private lookupVariable(widget: Widget, name: string): string | undefined {
    // Focus/attention accents *breathe*: intercept before the static theme
    // lookup so the theme-defined base colour is the thing that pulses (themes
    // define a static `focus`, which would otherwise short-circuit below).
    if (name === "focus" || name === "attention") {
      return this.resolveAccent(widget, name);
    }

    // 1. Check stylesheet variables
    if (this.stylesheetVariables[name] !== undefined) {
      return this.stylesheetVariables[name];
    }
    // 2. Check active/scoped theme colors
    const activeTheme = this.getActiveThemeForWidget(widget);
    if (activeTheme?.colors?.[name] !== undefined) {
      return activeTheme.colors[name];
    }

    // 3. Derived colors fallback
    const isLight = activeTheme ? isThemeLight(activeTheme) : false;

    // Disabled controls reuse the muted/dimmed tone unless a theme defines its
    // own `disabled` color. Resolved via `dimmed` so it works on every theme.
    if (name === "disabled") {
      return this.lookupVariable(widget, "dimmed");
    }

    if (name === "comment" || name === "placeholder" || name === "gutter" || name === "dimmed") {
      const bg = this.getWidgetColorWithFallback(
        widget,
        "background",
        activeTheme?.colors?.background || "#121212",
      );
      const fg = this.getWidgetColorWithFallback(
        widget,
        "color",
        activeTheme?.colors?.foreground || "#ffffff",
      );
      return blendColors(fg, bg, 0.45);
    }

    if (name === "border") {
      const bg = this.getWidgetColorWithFallback(
        widget,
        "background",
        activeTheme?.colors?.background || "#121212",
      );
      const fg = this.getWidgetColorWithFallback(
        widget,
        "color",
        activeTheme?.colors?.foreground || "#ffffff",
      );
      return blendColors(fg, bg, 0.15);
    }

    if (name === "selectionBg") {
      const bg = this.getWidgetColorWithFallback(
        widget,
        "background",
        activeTheme?.colors?.background || "#121212",
      );
      const accent =
        this.lookupVariable(widget, "accent") ||
        this.lookupVariable(widget, "primary") ||
        "#00ffff";
      return blendColors(accent, bg, 0.3);
    }

    if (name === "selectionFg") {
      const selBg = this.lookupVariable(widget, "selectionBg") || "#264f78";
      // Prefer the theme foreground when it already contrasts with the
      // selection background; otherwise use a soft near-pole instead of harsh
      // pure black/white.
      const fg = this.getWidgetColorWithFallback(
        widget,
        "color",
        activeTheme?.colors?.foreground || "#d6d6d6",
      );
      if (isColorLight(selBg) !== isColorLight(fg)) return fg;
      return isColorLight(selBg) ? "#1a1a1a" : "#f0f0f0";
    }

    if (name === "shadow") {
      const bg = this.getWidgetColorWithFallback(
        widget,
        "background",
        activeTheme?.colors?.background || "#121212",
      );
      return isLight ? blendColors("#000000", bg, 0.2) : "#000000";
    }

    // Syntax dynamic variables fallback
    if (name === "keyword" || name === "builtin" || name === "type" || name === "boolean") {
      return this.lookupVariable(widget, "primary");
    }
    if (name === "string" || name === "regex" || name === "attr-name" || name === "regexp") {
      return this.lookupVariable(widget, "warning");
    }
    if (name === "number") {
      return this.lookupVariable(widget, "accent");
    }
    if (name === "function") {
      return this.lookupVariable(widget, "secondary");
    }
    if (name === "operator") {
      return this.lookupVariable(widget, "foreground");
    }
    if (name === "punctuation") {
      return this.lookupVariable(widget, "dimmed");
    }
    if (name === "property") {
      return this.lookupVariable(widget, "primary");
    }
    if (name === "tag") {
      return this.lookupVariable(widget, "secondary");
    }

    // Diff colors
    if (name === "diff-added") {
      return this.lookupVariable(widget, "success") || (isLight ? "green" : "bright-green");
    }
    if (name === "diff-removed") {
      return this.lookupVariable(widget, "error") || (isLight ? "red" : "bright-red");
    }
    if (name === "diff-header") {
      return this.lookupVariable(widget, "primary") || "cyan";
    }
    // Row tints: mostly the widget background with the success/error color
    // blended in, strong enough to actually read as "added"/"removed" at a
    // glance rather than a near-invisible wash (text on top stays legible
    // with comfortable margin at these weights — verified against every
    // built-in theme, not just eyeballed). Light themes blend in *more* than
    // dark ones: the same blend weight reads as visibly weaker against a
    // near-white background than against a dark one, so light needs the
    // higher share to land at a similar felt intensity. Dark's weight is
    // lower than light's for the opposite reason too — blending toward an
    // already-dark background needs less to register, and going further
    // measurably costs text-on-tint contrast (0.40 dropped it from ~7.6-8.4:1
    // at the original 0.24 to ~5.3-6.3:1) for a background-distinguishability
    // gain most users don't need as much as the text staying easy to read.
    if (name === "diff-added-bg" || name === "diff-removed-bg") {
      const base =
        name === "diff-added-bg"
          ? this.lookupVariable(widget, "success") || "#4caf50"
          : this.lookupVariable(widget, "error") || "#f44336";
      const bg = this.getWidgetColorWithFallback(
        widget,
        "background",
        activeTheme?.colors?.background || "#121212",
      );
      return blendColors(base, bg, isLight ? 0.42 : 0.3);
    }

    return undefined;
  }

  public resolveStyles(widget: Widget, isHovered: boolean): WidgetStyles {
    const matchedRules: { specificity: number; properties: Record<string, string> }[] = [];

    for (const rule of this.rules) {
      const parsed = this.parseSelector(rule.selector);
      if (
        widget.matchesSelector(parsed.base) &&
        parsed.pseudos.every((p) => this.pseudoMatches(p, widget, isHovered))
      ) {
        const spec = this.calculateSpecificity(parsed.base, parsed.pseudos);
        matchedRules.push({ specificity: spec, properties: rule.properties });
      }
    }

    // Sort by specificity ascending
    matchedRules.sort((a, b) => a.specificity - b.specificity);

    const computed: Record<string, any> = {};

    // 1. Merge default style (which might have variables like $primary)
    if (widget.defaultStyle) {
      for (const [key, value] of Object.entries(widget.defaultStyle)) {
        if (value !== undefined) {
          const resolvedValue =
            typeof value === "string" ? this.resolveVariable(widget, value) : value;
          computed[key] =
            typeof resolvedValue === "string"
              ? this.coerceValue(key, resolvedValue)
              : resolvedValue;
        }
      }
    }

    // 2. Merge stylesheet rules (resolving variables)
    for (const rule of matchedRules) {
      for (const [key, value] of Object.entries(rule.properties)) {
        const resolvedValue =
          typeof value === "string" ? this.resolveVariable(widget, value) : value;
        computed[key] = this.coerceValue(key, resolvedValue);
      }
    }

    // 3. Merge inline style overrides (resolving variables)
    const inline = widget.style || {};
    for (const [key, value] of Object.entries(inline)) {
      if (value !== undefined) {
        const resolvedValue =
          typeof value === "string" ? this.resolveVariable(widget, value) : value;
        computed[key] =
          typeof resolvedValue === "string" ? this.coerceValue(key, resolvedValue) : resolvedValue;
      }
    }

    return computed as WidgetStyles;
  }

  private calculateSpecificity(baseSelector: string, pseudos: string[]): number {
    let idCount = 0;
    let classCount = 0;
    let tagCount = 0;

    const sel = baseSelector.trim();
    if (!sel) return 0;

    let tagMatch = "";
    let remainder = sel;

    if (!sel.startsWith("#") && !sel.startsWith(".")) {
      const match = sel.match(/^([a-zA-Z0-9_-]+)/);
      if (match) {
        tagMatch = match[1];
        remainder = sel.slice(tagMatch.length);
      }
    }

    if (tagMatch) {
      tagCount++;
    }

    const parts = remainder.match(/(#[a-zA-Z0-9_-]+|\.[a-zA-Z0-9_-]+)/g) || [];
    for (const part of parts) {
      if (part.startsWith("#")) {
        idCount++;
      } else if (part.startsWith(".")) {
        classCount++;
      }
    }

    // Each pseudo-class counts toward specificity like a regular class, so
    // `a:hover:focus` outranks a plain `a:hover`.
    classCount += pseudos.length;

    return idCount * 100 + classCount * 10 + tagCount;
  }

  /**
   * Whether a rule's pseudo-class (if any) matches the widget's current
   * state. Unset `pseudo` always matches. `:hover`/`:focus` are gated on the
   * live pointer/focus state passed in; `:disabled`/`:checked` read the
   * widget's own state. Any *other* pseudo-class fails closed (never
   * matches) rather than applying unconditionally — a stylesheet with an
   * unsupported pseudo-class (e.g. a typo, or one not implemented yet)
   * should silently do nothing, not silently apply everywhere.
   */
  private pseudoMatches(pseudo: string | undefined, widget: Widget, isHovered: boolean): boolean {
    if (pseudo === undefined) return true;
    if (pseudo === "hover") return isHovered;
    if (pseudo === "focus") return widget.focused;
    if (pseudo === "disabled") return widget.isDisabled();
    if (pseudo === "checked") {
      const checked = (widget as unknown as { checked?: unknown }).checked;
      return typeof checked === "boolean" && checked;
    }
    return false;
  }

  private parseSelector(sel: string): { base: string; pseudos: string[] } {
    const cached = this.selectorCache.get(sel);
    if (cached) return cached;
    // A selector may chain multiple pseudo-classes (e.g. `Button:focus:hover`);
    // every one after the base must be kept, not just the first, or a rule
    // like that would silently apply on `:focus` alone.
    const parts = sel.split(":");
    const parsed = {
      base: parts[0].trim(),
      pseudos: parts
        .slice(1)
        .map((p) => p.trim())
        .filter(Boolean),
    };
    this.selectorCache.set(sel, parsed);
    return parsed;
  }

  private coerceValue(key: string, val: string): any {
    if (key === "margin" || key === "padding") {
      const parts = val.split(/\s+/).map((p) => Number.parseInt(p, 10));
      if (parts.some(Number.isNaN)) return 0;
      if (parts.length === 1) return new Spacing(parts[0], parts[0], parts[0], parts[0]);
      if (parts.length === 2) return new Spacing(parts[0], parts[1], parts[0], parts[1]);
      // 3 values: top | horizontal | bottom
      if (parts.length === 3) return new Spacing(parts[0], parts[1], parts[2], parts[1]);
      if (parts.length === 4) return new Spacing(parts[0], parts[1], parts[2], parts[3]);
      return 0;
    }
    if (key === "minWidth" || key === "minHeight" || key === "maxWidth" || key === "maxHeight") {
      const parsed = Number.parseInt(val, 10);
      // An unparseable value (e.g. a keyword like "auto") must not poison the
      // widget's measured size — Math.max/Math.min with a NaN operand always
      // return NaN, permanently corrupting layout for that widget's lifetime.
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    if (
      key === "left" ||
      key === "right" ||
      key === "top" ||
      key === "bottom" ||
      key === "zIndex"
    ) {
      const parsed = Number.parseInt(val, 10);
      return Number.isNaN(parsed) ? val : parsed;
    }
    return val;
  }
}
