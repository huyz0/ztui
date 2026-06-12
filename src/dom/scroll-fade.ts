import { themeBlendBase } from "../core/theme.ts";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { parseColor } from "../render/color.ts";

// How strongly the edge rows blend toward the background to signal hidden
// content. The row at the very edge fades hardest, the next one less, giving a
// short gradient that reads as "more above/below".
const FADE_EDGE = 0.55;
const FADE_NEXT = 0.25;

/**
 * Fade the top and/or bottom row of a scroll viewport toward the background, a
 * soft gradient cue (alongside any scrollbar) that more rows exist past the
 * edge. Shared by the {@link Scrollable} mixin and the self-virtualizing list
 * widgets (table, list, tree, …), which each pass their own row-area `region`
 * and whether content is hidden above/below.
 *
 * Pure visual affordance: only the already-painted edge cells of `region` are
 * tinted. `bg` is the surface the rows sit on (so the fade dissolves into it);
 * `default`/unset falls back to the theme background.
 */
export function fadeScrollEdges(
  buffer: ScreenBuffer,
  region: Region,
  hiddenAbove: boolean,
  hiddenBelow: boolean,
  bg?: string,
): void {
  if (region.height < 2 || region.width <= 0) return;
  if (!hiddenAbove && !hiddenBelow) return;

  const base = themeBlendBase();
  const fade = (bg ? parseColor(bg)?.rgb : undefined) ?? base.bg;
  const blendRow = (y: number, a: number) =>
    buffer.blendRegion(
      new Region(new Offset(region.x, y), new Size(region.width, 1)),
      fade,
      a,
      base,
    );

  if (hiddenAbove) {
    blendRow(region.y, FADE_EDGE);
    if (region.height > 3) blendRow(region.y + 1, FADE_NEXT);
  }
  if (hiddenBelow) {
    blendRow(region.bottom - 1, FADE_EDGE);
    if (region.height > 3) blendRow(region.bottom - 2, FADE_NEXT);
  }
}
