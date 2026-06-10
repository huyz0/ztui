import { type RefObject, useLayoutEffect, useRef } from "react";
import { App } from "../../../core/app.ts";
import type { OverlayPlacement, OverlayRootWidget } from "../../../dom/overlay.ts";
import type { ScreenLayer } from "../../../dom/screen.ts";
import type { Widget } from "../../../dom/widget.ts";

export interface UseLayerOptions {
  open: boolean;
  modal: boolean;
  centered: boolean;
  dim: boolean;
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
    }
  });

  return rootRef;
}
