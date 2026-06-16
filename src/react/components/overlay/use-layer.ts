import { type RefObject, useLayoutEffect, useRef } from "react";
import { App } from "../../../core/app.ts";
import type { OverlayPlacement, OverlayRootWidget } from "../../../dom/overlay.ts";
import type { ScreenLayer } from "../../../dom/screen.ts";
import type { Widget } from "../../../dom/widget.ts";
import { Offset } from "../../../geometry/offset.ts";
import { Region } from "../../../geometry/region.ts";
import { Size } from "../../../geometry/size.ts";

export interface UseLayerOptions {
  open: boolean;
  modal: boolean;
  centered: boolean;
  dim: boolean;
  /** Scrim opacity multiplier (0..1) for a `dim` modal; defaults to 1. */
  dimAlpha?: number;
  passThrough: boolean;
  closeOnEscape: boolean;
  closeOnOutsideClick: boolean;
  onClose?: () => void;
  keyInterceptor?: (ev: import("../../../driver/driver.ts").KeyEvent) => void;
  /**
   * Sticky panels: ref to the widget to attach to (its live region drives
   * placement). A ref — not the widget itself — because the host element's ref
   * isn't populated until commit, after the render that calls this hook.
   */
  anchorRef?: RefObject<Widget | null>;
  /** Sticky panels: preferred side of the anchor. */
  placement?: OverlayPlacement;
  /**
   * Context menus: anchor the panel to a screen point, opening down-right and
   * flipping to stay on-screen. Takes precedence over {@link anchorRef}.
   */
  point?: { x: number; y: number } | null;
}

/**
 * Shared plumbing for `Dialog` / `StickyPanel`. Returns a ref for the
 * `ztui-overlay-root` host element; once it commits, the element is detached
 * from its place in the React tree and re-homed into the active screen's overlay
 * list as a {@link ScreenLayer}, then removed again on unmount.
 *
 * The host element stays a normal React node, so its children (the panel
 * content) reconcile, re-render, and run hooks exactly as written — only its
 * paint/focus home moves. Callbacks are read through refs so updating
 * `onClose` / `onKeyIntercept` does not re-stack the layer.
 */
export function useLayer(opts: UseLayerOptions) {
  const rootRef = useRef<OverlayRootWidget | null>(null);
  const onCloseRef = useRef(opts.onClose);
  onCloseRef.current = opts.onClose;
  const interceptRef = useRef(opts.keyInterceptor);
  interceptRef.current = opts.keyInterceptor;

  const { open, modal, centered, dim, passThrough, closeOnEscape, closeOnOutsideClick } = opts;

  useLayoutEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    const screen = App.instance?.activeScreen;
    if (!root || !screen) return;

    root.modal = modal;
    root.centered = centered;
    root.dim = dim;
    root.passThrough = passThrough;
    // anchor/placement are synced by the dedicated effect below (kept out of this
    // effect's deps so a changing anchor never re-stacks the layer).

    // Lift the element out of the normal tree and into the overlay layer.
    // Callbacks are read through refs so updating them never re-stacks the layer.
    root.parent?.removeChild(root);
    const layer: ScreenLayer = {
      root,
      modal,
      closeOnEscape,
      closeOnOutsideClick,
      onClose: () => onCloseRef.current?.(),
      keyInterceptor: (ev) => interceptRef.current?.(ev),
    };
    screen.pushLayer(layer);
    App.instance?.queueRender();

    return () => {
      screen.removeLayer(root);
      App.instance?.queueRender();
    };
  }, [open, modal, centered, dim, passThrough, closeOnEscape, closeOnOutsideClick]);

  // Keep the anchor/placement live without re-stacking the layer. Runs after
  // commit, so the anchor ref is populated; reads it each commit so the panel
  // tracks a changing anchor target.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root) {
      root.anchor = opts.anchorRef?.current ?? null;
      root.placement = opts.placement ?? "auto";
      // A point is a 0-size anchor rect: the menu opens at the cursor and flips
      // to whichever side fits (see placeByBestSide).
      root.anchorRect = opts.point
        ? new Region(new Offset(opts.point.x, opts.point.y), new Size(0, 0))
        : null;
      root.dimAlpha = opts.dimAlpha ?? 1;
    }
  });

  return rootRef;
}
