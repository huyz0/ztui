/**
 * Shared keyboard-navigation maps for the data widgets. Both helpers are pure
 * (no widget state, no side effects), so each widget keeps ownership of its own
 * scroll/selection field and any extra bookkeeping (tailing, render scheduling),
 * while the up/down/page/home/end key mapping lives in exactly one place.
 */

/** Page step for `pageup`/`pagedown`: one viewport minus a row of overlap. */
export function pageStep(visibleRows: number): number {
  return Math.max(1, visibleRows - 1);
}

/**
 * The new `scrollTop` for a vertical-scroll key, clamped to `[0, max]`, or
 * `null` when `name` is not a scroll key (so the caller leaves the event
 * unhandled). Used by scrolling viewports (diff, traceback, rich-log, terminal).
 */
export function scrollTopForKey(
  name: string,
  scrollTop: number,
  max: number,
  visibleRows: number,
): number | null {
  const page = pageStep(visibleRows);
  switch (name) {
    case "up":
      return Math.max(0, scrollTop - 1);
    case "down":
      return Math.min(max, scrollTop + 1);
    case "pageup":
      return Math.max(0, scrollTop - page);
    case "pagedown":
      return Math.min(max, scrollTop + page);
    case "home":
      return 0;
    case "end":
      return max;
    default:
      return null;
  }
}

/**
 * The selection-cursor delta for a navigation key (pass to `moveSelection`), or
 * `null` when `name` is not a selection-move key. `home`/`end` jump to the
 * ends via a delta large enough to saturate against the list bounds. Used by
 * cursor lists (list-view, selection-list, tree).
 */
export function selectionDeltaForKey(
  name: string,
  visibleRows: number,
  count: number,
): number | null {
  const page = pageStep(visibleRows);
  switch (name) {
    case "up":
      return -1;
    case "down":
      return 1;
    case "pageup":
      return -page;
    case "pagedown":
      return page;
    case "home":
      return -count;
    case "end":
      return count;
    default:
      return null;
  }
}
