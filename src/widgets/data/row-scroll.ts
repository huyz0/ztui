/**
 * Shared math for the row-indexed scrollers (`ListView`, `SelectionList`,
 * `Tree`, `RichLog`, `Table`, `TerminalView`, `Diff`, `Traceback`). These widgets
 * scroll by whole rows (a `scrollTop` row index), distinct from the pixel/cell
 * {@link Scrollable} mixin, so the arithmetic lived inline and byte-identical in
 * each. Centralizing it here keeps the clamping and track-mapping in one place;
 * each widget still owns its `scrollTop` field, its repaint call, and any
 * tailing/header specifics.
 */

/** The largest valid `scrollTop`: the rows that don't fit above the viewport. */
export function maxRowScrollTop(rowCount: number, visibleRows: number): number {
  return Math.max(0, rowCount - visibleRows);
}

/**
 * The next `scrollTop` after a mouse-wheel step, clamped to `[0, max]`. Returns
 * `null` when `type` isn't a wheel scroll, so callers can leave the event for
 * other handlers.
 */
export function wheelScrollTop(type: string, scrollTop: number, max: number): number | null {
  if (type === "scroll_up") return Math.max(0, scrollTop - 1);
  if (type === "scroll_down") return Math.min(max, scrollTop + 1);
  return null;
}

/**
 * Map a pointer `y` on the scrollbar track to a proportional `scrollTop`. The
 * track spans `trackH` rows starting at `trackTop`. Returns `null` when the track
 * is too short or there's nothing to scroll (so the caller leaves `scrollTop` as
 * is).
 */
export function trackYToScrollTop(
  y: number,
  trackTop: number,
  trackH: number,
  maxScroll: number,
): number | null {
  if (trackH <= 1 || maxScroll <= 0) return null;
  const ratio = Math.max(0, Math.min(1, (y - trackTop) / (trackH - 1)));
  return Math.round(ratio * maxScroll);
}
