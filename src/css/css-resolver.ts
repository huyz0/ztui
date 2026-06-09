import { isColorLight, isThemeLight, ThemeManager } from "../core/theme.ts";
import type { WidgetStyles } from "../dom/widget.ts";
import { Widget } from "../dom/widget.ts";
import { Spacing } from "../geometry/spacing.ts";
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

  constructor(rules: CSSRule[] = []) {
    this.rules = rules;
    if (rules && "variables" in rules && rules.variables) {
      this.addVariables(rules.variables as Record<string, string>);
    }
  }

  public addRules(rules: CSSRule[]): void {
    this.rules.push(...rules);
    if (rules && "variables" in rules && rules.variables) {
      this.addVariables(rules.variables as Record<string, string>);
    }
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
        }
      }
      current = current.parent && current.parent instanceof Widget ? current.parent : null;
    }
    return defaultVal;
  }

  private lookupVariable(widget: Widget, name: string): string | undefined {
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

    if (name === "focus") {
      return this.lookupVariable(widget, "primary") || this.lookupVariable(widget, "foreground");
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
      const selBg = this.lookupVariable(widget, "selectionBg") || "#00ffff";
      return isColorLight(selBg) ? "#000000" : "#ffffff";
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

    return undefined;
  }

  public resolveStyles(widget: Widget, isHovered: boolean): WidgetStyles {
    const matchedRules: { specificity: number; properties: Record<string, string> }[] = [];

    for (const rule of this.rules) {
      const parsed = this.parseSelector(rule.selector);
      if (widget.matchesSelector(parsed.base)) {
        if (parsed.pseudo === "hover" && !isHovered) continue;
        if (parsed.pseudo === "focus" && !widget.focused) continue;

        const spec = this.calculateSpecificity(parsed.base, parsed.pseudo);
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

  private calculateSpecificity(baseSelector: string, pseudo?: string): number {
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

    if (pseudo) {
      classCount++;
    }

    return idCount * 100 + classCount * 10 + tagCount;
  }

  private parseSelector(sel: string): { base: string; pseudo?: string } {
    const parts = sel.split(":");
    return {
      base: parts[0].trim(),
      pseudo: parts[1]?.trim(),
    };
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
      return Number.parseInt(val, 10);
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
