import { resolveEasing } from "../../../anim/easing.ts";
import { BLACK, mix, parseColor, rgbStr, WHITE } from "../../../render/color.ts";

/** Full blink period (on → off → on) for the smooth caret, in milliseconds. */
export const SMOOTH_CARET_PERIOD = 1060;
/** Repaint cadence while a smooth caret is animating (~17fps — easy on the diff). */
export const SMOOTH_CARET_TICK = 60;

const easeCaret = resolveEasing("in-out-cubic");

/**
 * Caret opacity in [0,1] for a smooth (eased) blink, given milliseconds elapsed
 * since the caret last reset to solid. A cosine drives the on→off→on cycle and
 * an in-out-cubic flattens the extremes, so the caret lingers solid and lingers
 * dark with quick, soft transitions between — a gentle pulse rather than the
 * hard square-wave toggle.
 */
export function smoothCaretIntensity(elapsedMs: number): number {
  const phase =
    (((elapsedMs % SMOOTH_CARET_PERIOD) + SMOOTH_CARET_PERIOD) % SMOOTH_CARET_PERIOD) /
    SMOOTH_CARET_PERIOD;
  const raw = (Math.cos(phase * Math.PI * 2) + 1) / 2; // 1 at phase 0, 0 at 0.5
  return easeCaret(raw);
}

/**
 * Blend a caret cell at a given `intensity` (1 = fully lit, 0 = invisible).
 *
 * - `block`: an appended `█` past the end of the text — fades the glyph colour
 *   from the surface up to the focus colour.
 * - over a character: the background eases surface → focus, and the glyph eases
 *   between its *own* colour (caret dark, sitting on the surface) and a colour
 *   chosen to *contrast the caret* (caret fully lit, sitting on the focus
 *   colour). The contrast target is black or white by the focus colour's
 *   luminance, so the lit caret is always readable; as the caret dims the glyph
 *   returns to its original colour.
 *
 * Returns concrete `rgb(...)` strings. Unparseable inputs fall back to the lit
 * endpoint so a bad theme value never blanks the caret.
 */
export function blendCaretColors(
  intensity: number,
  focus: string,
  bg: string,
  fg: string,
  block: boolean,
): { color: string; background: string } {
  const focusRgb = parseColor(focus)?.rgb;
  const bgRgb = parseColor(bg)?.rgb;
  const fgRgb = parseColor(fg)?.rgb;
  const t = intensity < 0 ? 0 : intensity > 1 ? 1 : intensity;
  const background = focusRgb && bgRgb ? rgbStr(mix(bgRgb, focusRgb, t)) : focus;

  if (block) {
    // No character underneath: the block glyph *is* the caret, so fade the glyph
    // colour from the surface up to the focus colour.
    return { color: background, background: bg };
  }
  if (!focusRgb || !fgRgb) return { color: fg, background };
  // Glyph eases from its own colour toward whichever of black/white best
  // contrasts the caret's focus colour, so the lit caret reads cleanly and the
  // character is restored to normal as the caret fades back to the surface.
  const luminance = (0.299 * focusRgb.r + 0.587 * focusRgb.g + 0.114 * focusRgb.b) / 255;
  const contrast = luminance > 0.5 ? BLACK : WHITE;
  return { color: rgbStr(mix(fgRgb, contrast, t)), background };
}
