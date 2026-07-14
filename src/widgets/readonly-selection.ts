import { App } from "../core/app.ts";
import type { SelectableWidget } from "../core/selection.ts";
import { Widget } from "../dom/widget.ts";
import type { MouseEvent } from "../driver/driver.ts";
import { Offset } from "../geometry/offset.ts";
import { splitGraphemes } from "../render/segment.ts";
import { wordRangeAt } from "../render/text-selection.ts";

/**
 * Mouse-drag text selection for read-only display widgets. Press anchors a
 * logical selection point (or does nothing if the cell is chrome), drag extends
 * it — auto-scrolling the nearest scrollable ancestor when the cursor leaves the
 * viewport — and release copies the selected content. Highlight + copy live in
 * `App.selection` (a content-space model), so this only translates mouse events
 * into logical points.
 */

/** Outermost `selectionContainer` ancestor (bounds a cross-widget selection), or self. */
function selectionRoot(widget: Widget): Widget {
  let root = widget;
  let node = widget.parent;
  while (node) {
    if (node instanceof Widget && node.selectionContainer) root = node;
    node = node.parent;
  }
  return root;
}

interface Scrollable extends Widget {
  scrollableY: boolean;
  scrollOffset: Offset;
  getContentSize(): { height: number };
}

function asScrollable(w: Widget): Scrollable | null {
  const s = w as Partial<Scrollable>;
  return s.scrollableY === true && typeof s.getContentSize === "function"
    ? (w as Scrollable)
    : null;
}

/** Nearest scrollable ancestor (inclusive) of `widget`, or null. */
function scrollerFor(widget: Widget): Scrollable | null {
  let node: Widget | null = widget;
  while (node) {
    const s = asScrollable(node);
    if (s) return s;
    node = node.parent instanceof Widget ? node.parent : null;
  }
  return null;
}

/** Scroll `s` by `dy` rows, clamped to its content; returns true if it moved. */
function scrollStep(s: Scrollable, dy: number): boolean {
  const view = s.getContentRect();
  const maxY = Math.max(0, s.getContentSize().height - view.height);
  const nextY = Math.max(0, Math.min(maxY, s.scrollOffset.y + dy));
  if (nextY === s.scrollOffset.y) return false;
  s.scrollOffset = new Offset(s.scrollOffset.x, nextY);
  return true;
}

// One active auto-scroll loop while a drag is held past a viewport edge.
let autoScroll: { timer: ReturnType<typeof setInterval>; root: Widget } | null = null;

function stopAutoScroll(): void {
  if (autoScroll) {
    clearInterval(autoScroll.timer);
    autoScroll = null;
  }
}

export function handleReadonlySelectionMouse(widget: Widget, ev: MouseEvent): void {
  const app = App.instance;
  if (!app || ev.button !== "left") return;
  const root = selectionRoot(widget);

  if (ev.type === "press") {
    stopAutoScroll();
    const pt = app.selection.pointFromScreen(ev.x, ev.y);
    if (!pt) return; // nothing selectable rendered at all
    // Double-click selects the word under the cursor; triple-click selects the
    // whole content line. The matching release copies it (same path as a drag).
    if (ev.clickCount === 2 || ev.clickCount === 3) {
      const lines = (pt.widget as unknown as SelectableWidget).selectableLines?.() ?? [];
      const lineChars = splitGraphemes(lines[pt.line] ?? "");
      const [start, end] =
        ev.clickCount === 3 ? [0, lineChars.length] : wordRangeAt(lineChars, pt.col);
      app.selection.active = {
        group: root,
        anchor: { widget: pt.widget, line: pt.line, col: start },
        caret: { widget: pt.widget, line: pt.line, col: end },
      };
      app.queueRender();
      return;
    }
    // A press on chrome snaps to the closest content, so the user doesn't have
    // to land exactly on a glyph; a bare click still selects nothing until a
    // drag moves the caret.
    app.selection.active = { group: root, anchor: pt, caret: pt };
    app.queueRender();
    return;
  }

  if (ev.type === "drag" && app.selection.active?.group === root) {
    extendTo(app, root, ev.x, ev.y);
    driveAutoScroll(app, root, ev.x, ev.y);
    return;
  }

  if (ev.type === "release" && app.selection.active?.group === root) {
    stopAutoScroll();
    app.copyActiveSelection();
  }
}

/** Move the caret to the content under (x, y), snapping past line ends. */
function extendTo(app: App, root: Widget, x: number, y: number): void {
  const sel = app.selection.active;
  if (!sel || sel.group !== root) return;
  const pt = app.selection.pointFromScreen(x, y);
  if (pt) {
    sel.caret = pt;
    app.queueRender();
  }
}

/**
 * Auto-scroll the nearest scrollable ancestor while the cursor is past the
 * viewport edge, extending the caret as new content scrolls in. Runs on a timer
 * so a held-still drag keeps scrolling; each tick re-reads the freshly rendered
 * content runs.
 */
function driveAutoScroll(app: App, root: Widget, x: number, y: number): void {
  const scroller = scrollerFor(root);
  if (!scroller) {
    stopAutoScroll();
    return;
  }
  const view = scroller.getContentRect();
  const dir = y < view.y ? -1 : y >= view.bottom ? 1 : 0;

  if (dir === 0) {
    stopAutoScroll();
    return;
  }

  const tick = () => {
    if (!app.selection.active || app.selection.active.group !== root) {
      stopAutoScroll();
      return;
    }
    if (!scrollStep(scroller, dir)) return; // hit the end; caret already at the extreme
    app.queueRender();
    // Map the cursor (clamped to the edge row) onto the now-visible content.
    const edgeY = dir < 0 ? view.y : view.bottom - 1;
    extendTo(app, root, x, edgeY);
  };

  tick(); // immediate step in response to this drag
  // Always rebind the interval to this call's `tick` closure — it's the only
  // one that captures the current `dir`/`x`/`y`. A held drag re-invokes this
  // function on every subsequent drag/move event, so replacing the interval
  // each time keeps it in sync; without this, a direction reversal (e.g. the
  // cursor crosses from below the viewport to above it) would leave the
  // *previous* interval running forever with the stale direction and
  // coordinates, since only a `!autoScroll` interval-less state started one.
  if (autoScroll) clearInterval(autoScroll.timer);
  autoScroll = { timer: setInterval(tick, 50), root };
  (autoScroll.timer as { unref?: () => void }).unref?.();
}
