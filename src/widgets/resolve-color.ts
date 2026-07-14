import { App } from "../core/app.ts";
import type { Widget } from "../dom/widget.ts";

/**
 * Resolve a colour that may be a theme variable (`$accent`), a literal
 * (`#4daafc`, `red`), or unset. Theme variables resolve against the widget's own
 * app — falling back to the {@link App.instance} singleton when the widget isn't
 * mounted yet — and an unresolved/unset colour yields `fallback`.
 *
 * Shared by the data/feedback widgets (chart, gauge, description-list) that paint
 * caller-supplied colours through the theme; keeps one definition instead of a
 * copy per widget.
 */
export function resolveColor(widget: Widget, color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  if (color.startsWith("$")) {
    const resolved = (widget.app ?? App.instance)?.cssResolver.resolveVariable(widget, color);
    // An unknown variable name resolves back to the literal, unresolved
    // `$name` token (see CSSResolver.resolveVariable), not undefined/empty —
    // that token is truthy, so `|| fallback` alone never catches it.
    if (!resolved || resolved === color) return fallback;
    return resolved;
  }
  return color;
}
