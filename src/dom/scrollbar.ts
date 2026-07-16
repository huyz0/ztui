import type { Region } from "../geometry/region.ts";
import { mix, parseColor, rgbStr } from "../render/color.ts";
import { Style } from "../render/style.ts";
import type { Widget } from "./widget.ts";

/** Where a scrollbar's track runs, along one axis. */
export interface ScrollbarTrack {
  /** The column (vertical bar) or row (horizontal bar) the track is painted on. */
  line: number;
  /** First cell of the track, along the track's own axis. */
  start: number;
  /** Last cell of the track (inclusive), along the track's own axis. */
  end: number;
  /** `end - start + 1` — negative/zero when there's no room to paint a track. */
  length: number;
}

/**
 * Geometry of a scrollable's vertical scrollbar track: bordered widgets paint
 * on the border itself (outside `content`); borderless ones paint at the
 * viewport's right edge. Shared by hit-testing, drag handling, and painting so
 * the three can't independently drift on where the bar actually sits.
 */
export function verticalScrollbarTrack(
  client: Region,
  content: Region,
  viewport: Region,
  hasBorder: boolean,
): ScrollbarTrack {
  const start = hasBorder ? client.y + 1 : content.y;
  const end = hasBorder ? client.bottom - 2 : content.bottom - 1;
  return {
    line: hasBorder ? client.right - 1 : viewport.right - 1,
    start,
    end,
    length: end - start + 1,
  };
}

/** Horizontal counterpart of {@link verticalScrollbarTrack}. */
export function horizontalScrollbarTrack(
  client: Region,
  content: Region,
  viewport: Region,
  hasBorder: boolean,
): ScrollbarTrack {
  const start = hasBorder ? client.x + 1 : content.x;
  const end = hasBorder ? client.right - 2 : content.right - 1;
  return {
    line: hasBorder ? client.bottom - 1 : viewport.bottom - 1,
    start,
    end,
    length: end - start + 1,
  };
}

/** Where a scrollbar's thumb sits within its track, derived from scroll state. */
export interface ScrollbarThumb {
  /** Thumb size along the track (in cells), at least 1. */
  size: number;
  /** First cell the thumb occupies, along the track's axis. */
  start: number;
  /** The maximum scroll offset (content extent minus viewport extent), clamped to ≥0. */
  maxScroll: number;
}

/**
 * Thumb size/position for one axis, given the track it slides in. `viewportExtent`
 * is the visible size along this axis (content.width/height); `contentExtent` is
 * the full scrollable size. Shared by drag handling and painting.
 */
export function scrollbarThumb(
  track: ScrollbarTrack,
  viewportExtent: number,
  contentExtent: number,
  scrollOffset: number,
): ScrollbarThumb {
  const size = Math.max(
    1,
    Math.round((viewportExtent / Math.max(1, contentExtent)) * track.length),
  );
  const maxScroll = Math.max(0, contentExtent - viewportExtent);
  const scrollRatio = maxScroll > 0 ? scrollOffset / maxScroll : 0;
  const start = track.start + Math.round(scrollRatio * (track.length - size));
  return { size, start, maxScroll };
}

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
