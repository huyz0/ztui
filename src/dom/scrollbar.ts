import { mix, parseColor, rgbStr } from "../render/color.ts";
import { Style } from "../render/style.ts";
import type { Widget } from "./widget.ts";

/**
 * Background-fill style for a scrollbar **track** (the gutter the thumb slides
 * in). Callers paint it with a space glyph so it reads as a clean solid shade
 * rather than a `░`/`▒` shaded character — those render unevenly (speckled, with
 * inconsistent weight) across terminal fonts, which looked poor. The colour is
 * the thumb colour blended most of the way toward the widget background, giving a
 * faint solid gutter that stays dimmer than the thumb and adapts to the theme.
 *
 * Mirrors how every scrollbar derives its thumb colour (`borderColor`/`color`,
 * falling back to the `$dimmed` token when unset) so the track always has a
 * concrete colour to dim, even when the thumb itself uses the terminal default.
 */
export function scrollbarTrackStyle(widget: Widget): Style {
  const cs = widget.computedStyle;
  let fg = cs.borderColor || cs.color;
  if (!fg || fg === "default") {
    fg = widget.app?.cssResolver.resolveVariable(widget, "$dimmed") || "gray";
  }
  const bg = widget.findResolvedBackground();
  const fgRGB = parseColor(fg)?.rgb;
  const bgRGB = parseColor(bg)?.rgb;
  const track = fgRGB && bgRGB ? rgbStr(mix(bgRGB, fgRGB, 0.3)) : fg;
  return new Style({ background: track });
}
