import type { Widget, WidgetStyles } from "../dom/widget.ts";
import { Spacing } from "../geometry/spacing.ts";
import type { CSSRule } from "./css-parser.ts";

export class CSSResolver {
  private rules: CSSRule[] = [];

  constructor(rules: CSSRule[] = []) {
    this.rules = rules;
  }

  public addRules(rules: CSSRule[]): void {
    this.rules.push(...rules);
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
    if (widget.defaultStyle) {
      for (const [key, value] of Object.entries(widget.defaultStyle)) {
        if (value !== undefined) {
          computed[key] = value;
        }
      }
    }
    for (const rule of matchedRules) {
      for (const [key, value] of Object.entries(rule.properties)) {
        computed[key] = this.coerceValue(key, value);
      }
    }

    // Inline style overrides stylesheet rules
    const inline = widget.style || {};
    for (const [key, value] of Object.entries(inline)) {
      if (value !== undefined) {
        computed[key] = value;
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
      if (parts.length === 4) return new Spacing(parts[0], parts[1], parts[2], parts[3]);
      return 0;
    }
    if (key === "minWidth" || key === "minHeight" || key === "maxWidth" || key === "maxHeight") {
      return Number.parseInt(val, 10);
    }
    return val;
  }
}
