import type { DOMNode } from "../dom/dom.ts";
import { OverlayRootWidget } from "../dom/overlay.ts";
import { Screen } from "../dom/screen.ts";
import type { ScrollableMembers } from "../dom/scrollable.ts";
import { Widget } from "../dom/widget.ts";

/** A node's paint z-index — only {@link Widget}s carry one; everything else is 0. */
function zIndexOf(node: DOMNode): number {
  return node instanceof Widget ? (node.computedStyle.zIndex ?? 0) : 0;
}

/**
 * Resolve the topmost {@link Widget} under a screen point, mirroring paint order:
 * overlays before normal children, higher `zIndex` before lower, later siblings
 * before earlier. Returns the widget that owns the pixel (a scrollbar column
 * resolves to its scrollable), or `null` when nothing is hit.
 *
 * Pure over the node tree — no app state — so it is unit-testable in isolation
 * and shared by the App's mouse dispatch.
 */
export function hitTest(node: DOMNode, x: number, y: number): Widget | null {
  if (!(node instanceof Widget) || !node.visible) {
    return null;
  }

  // Pointer-transparent widgets (and their subtree) never capture the pointer —
  // a full-screen decorative overlay (e.g. the DevTools highlight) paints on top
  // but clicks fall through to the UI beneath. (CSS `pointer-events: none`.)
  if (node.pointerTransparent) {
    return null;
  }

  // Hit-test overlays first if this node is a Screen
  if (node instanceof Screen) {
    // Topmost-first: `overlays` is oldest-first (appended via push, painted in
    // that order so later entries paint over earlier ones), so newest-first
    // is the reverse of array order — never a plain forward walk. Only
    // allocate a sorted copy when z-indices actually differ (rare); a
    // same-z-index tie still resolves newest-first (higher original index
    // wins), matching paint order.
    const overlays = node.overlays;
    let needsSort = false;
    for (let i = 1; i < overlays.length; i++) {
      if ((overlays[i].computedStyle.zIndex ?? 0) !== (overlays[0].computedStyle.zIndex ?? 0)) {
        needsSort = true;
        break;
      }
    }
    const orderedOverlays = needsSort
      ? overlays
          .map((o, i) => ({ o, i }))
          .sort((a, b) => {
            const dz = (b.o.computedStyle.zIndex ?? 0) - (a.o.computedStyle.zIndex ?? 0);
            return dz !== 0 ? dz : b.i - a.i;
          })
          .map((entry) => entry.o)
      : [...overlays].reverse();
    for (const overlay of orderedOverlays) {
      const match = hitTest(overlay, x, y);
      if (match) {
        // A sticky pass-through layer only captures clicks that land on its
        // panel content; clicks that resolve to the bare backdrop fall through
        // to the layer below (keeping e.g. a chatbox clickable).
        if (match === overlay && overlay instanceof OverlayRootWidget && overlay.passThrough) {
          continue;
        }
        return match;
      }
    }
  }

  if (!node.region.contains(x, y)) {
    return null;
  }

  if (isPointOnScrollbar(node, x, y)) {
    return node;
  }

  // Fast path: when no child sets a z-index (the overwhelming common case),
  // the stable z-sort is a no-op, so hit-test in document order without
  // allocating + sorting a copy at every node on every mouse event.
  const children = node.children;
  let hasZ = false;
  for (let i = 0; i < children.length; i++) {
    if (zIndexOf(children[i]) !== 0) {
      hasZ = true;
      break;
    }
  }
  if (!hasZ) {
    for (let i = 0; i < children.length; i++) {
      const match = hitTest(children[i], x, y);
      if (match) return match;
    }
    return node;
  }

  const sorted = [...children].sort((a, b) => zIndexOf(b) - zIndexOf(a));

  for (const child of sorted) {
    const match = hitTest(child, x, y);
    if (match) {
      return match;
    }
  }

  return node;
}

/**
 * True when `(x, y)` lands on a scrollable widget's painted scrollbar (the
 * viewport-edge column/row, not the gutter it reserves). Duck-typed so it only
 * matches widgets that mix in {@link ScrollableMembers}.
 */
export function isPointOnScrollbar(widget: Widget, x: number, y: number): boolean {
  const maybe = widget as Widget & Partial<ScrollableMembers>;
  const isScrollable = maybe.scrollableX !== undefined || maybe.scrollableY !== undefined;
  if (!isScrollable) return false;
  const parent = widget as Widget & ScrollableMembers;

  const client = parent.getClientRect();
  const content = parent.getContentRect();
  // The scrollbar is painted at the full viewport edge (outside the gutter it
  // reserves), so hit-test against that, not the gutter-shrunk content rect.
  const viewport = parent.getViewportRect ? parent.getViewportRect() : content;
  const contentSize = parent.getContentSize();
  const hasBorder = parent.computedStyle.border && parent.computedStyle.border !== "none";

  const overflowY = parent.computedStyle.overflowY || "auto";
  const showY =
    overflowY === "scroll" || (overflowY === "auto" && contentSize.height > viewport.height);
  const overflowX = parent.computedStyle.overflowX || "auto";
  const showX =
    overflowX === "scroll" || (overflowX === "auto" && contentSize.width > viewport.width);

  // Match drawScrollbars' own guard: a scrollbar isn't painted at all when
  // the content rect has collapsed to zero height/width, so it must not
  // swallow clicks either — otherwise an invisible bar still intercepts input.
  if (showY && content.height > 0) {
    const vScrollbarX = hasBorder ? client.right - 1 : viewport.right - 1;
    const startY = hasBorder ? client.y + 1 : content.y;
    const endY = hasBorder ? client.bottom - 2 : content.bottom - 1;
    if (x === vScrollbarX && y >= startY && y <= endY) {
      return true;
    }
  }

  if (showX && content.width > 0) {
    const hScrollbarY = hasBorder ? client.bottom - 1 : viewport.bottom - 1;
    const startX = hasBorder ? client.x + 1 : content.x;
    const endX = hasBorder ? client.right - 2 : content.right - 1;
    if (y === hScrollbarY && x >= startX && x <= endX) {
      return true;
    }
  }

  return false;
}
