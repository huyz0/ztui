import { requestAnimationTick } from "../anim/animation.ts";
import { motion } from "../anim/motion.ts";
import type { KeyEvent } from "../driver/driver.ts";
import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import type { DOMNode } from "./dom.ts";
import type { OverlayRootWidget } from "./overlay.ts";
import type { AccessibleNode } from "./widget.ts";
import { Widget } from "./widget.ts";

/**
 * A floating layer stacked above the normal widget tree — a modal dialog or a
 * non-modal sticky panel. Layers share the {@link Screen.overlays} paint list
 * but add focus and key-routing semantics on top of it.
 */
export interface ScreenLayer {
  /** The full-screen root the layer's content is portalled into. */
  root: OverlayRootWidget;
  /** Modal layers trap focus and block keys/mouse from reaching the layer below. */
  modal: boolean;
  /** Esc dismisses the layer (calls {@link onClose}) when it bubbles unhandled. */
  closeOnEscape: boolean;
  /** A click outside the panel dismisses the layer. */
  closeOnOutsideClick: boolean;
  /** Invoked when the layer requests to close (Esc / outside click). */
  onClose?: () => void;
  /**
   * Sticky panels: sees key events before they bubble to the focused widget, so
   * it can claim navigation keys (↑/↓/Enter) while ordinary text still flows to
   * the focused control below. Set `ev.handled` to consume the key.
   */
  keyInterceptor?: (ev: KeyEvent) => void;
  /** Focus to restore when a modal layer is removed (filled in by pushLayer). */
  previousFocus?: Widget | null;
}

/** Repaint cadence for the ambient focus breathing (~13fps — easy on the diff). */
const FOCUS_TICK_MS = 75;

/** The root widget of one screen: holds the widget tree, focus, and overlay layers. {@link App} renders the active one. */
/** Render one {@link AccessibleNode} as a compact line: `role: "label" =value [state]`. */
function formatAccessible(a: AccessibleNode): string {
  let s = a.role;
  if (a.label) s += `: "${a.label}"`;
  if (a.value !== undefined) s += ` =${a.value}`;
  if (a.state && a.state.length > 0) s += ` [${a.state.join(", ")}]`;
  return s;
}

export class Screen extends Widget {
  private _focusedWidget: Widget | null = null;
  /** Top-level overlay roots (dialogs, dropdowns) painted above the tree. */
  public overlays: Widget[] = [];
  /** Active layers, bottom-to-top (last is topmost). */
  public layers: ScreenLayer[] = [];

  constructor() {
    super("screen");
  }

  /** The widget currently holding keyboard focus, if any. */
  public get focusedWidget(): Widget | null {
    return this._focusedWidget;
  }

  /** Resize the screen and re-layout its tree. */
  public resize(width: number, height: number): void {
    this.region = new Region(Offset.ORIGIN, new Size(width, height));
  }

  public override measure(maxW: number, maxH: number): void {
    for (const child of this.children) {
      if (child instanceof Widget && child.visible) {
        child.measure(maxW, maxH);
      }
    }
    this.measuredWidth = maxW;
    this.measuredHeight = maxH;
  }

  /** Add a top-level overlay root (painted above the main tree). */
  public addOverlay(widget: Widget): void {
    widget.parent = this;
    this.overlays.push(widget);
  }

  /** Remove a previously added overlay root. */
  public removeOverlay(widget: Widget): void {
    const idx = this.overlays.indexOf(widget);
    if (idx !== -1) {
      this.overlays.splice(idx, 1);
      widget.parent = null;
    }
  }

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
    // Draw overlays on top of all normal children
    for (const overlay of this.overlays) {
      overlay.render(buffer);
    }
    // Keep the ambient focus "breathing" alive: while something is focused and
    // motion is enabled, book the next gentle repaint so the $focus accent (a
    // time-varying colour resolved during render) advances. One central tick for
    // the whole tree — widgets don't each schedule their own.
    if (motion.enabled && this._focusedWidget) {
      // Paint-only: the focus accent is just a border colour. Repaint instead of
      // relaying out the entire tree ~60×/s while a widget holds focus.
      requestAnimationTick(this._focusedWidget, FOCUS_TICK_MS, true);
    }
  }

  /**
   * A plain-text, screen-reader-style rendering of the visible widget tree:
   * one line per semantically-meaningful widget (see
   * {@link Widget.getAccessibleNode}), indented by nesting depth, with active
   * overlays/layers appended. Useful for accessibility tooling and for asserting
   * *what* a screen presents in tests without diffing pixels.
   */
  public toAccessibleText(): string {
    const lines: string[] = [];
    const visit = (node: DOMNode, depth: number): void => {
      let nextDepth = depth;
      if (node instanceof Widget) {
        const a = node.getAccessibleNode();
        if (a) {
          lines.push(`${"  ".repeat(depth)}${formatAccessible(a)}`);
          nextDepth = depth + 1;
        }
      }
      for (const child of node.children) visit(child, nextDepth);
    };
    visit(this, 0);
    for (const layer of this.layers) {
      lines.push(`[${layer.modal ? "modal" : "layer"}]`);
      visit(layer.root, 0);
    }
    return lines.join("\n");
  }

  /** All focusable, enabled, visible widgets in tab order. */
  public getFocusableWidgets(): Widget[] {
    // A modal layer traps focus: Tab cycles only within the topmost modal.
    const modal = this.topModalLayer;
    const root: Widget = modal ? modal.root : this;
    const list: Widget[] = [];
    // Document order, not paint (z-index) order — z-index is purely a
    // stacking concept and shouldn't reorder the Tab sequence.
    root.walkDocumentOrder((node) => {
      if (node instanceof Widget && node.focusable && node.visible && !node.isDisabled()) {
        list.push(node);
      }
    });
    return list;
  }

  /** The topmost modal layer, or null when no modal is open. */
  public get topModalLayer(): ScreenLayer | null {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      if (this.layers[i].modal) return this.layers[i];
    }
    return null;
  }

  /**
   * Stack a new layer (dialog or sticky panel). The layer's root is added to the
   * overlay paint list; a modal layer additionally saves the current focus and
   * moves focus to the first focusable inside the layer.
   */
  public pushLayer(layer: ScreenLayer): void {
    layer.previousFocus = this._focusedWidget;
    this.addOverlay(layer.root);
    this.layers.push(layer);
    if (layer.modal) {
      const focusables: Widget[] = [];
      layer.root.walkDocumentOrder((node) => {
        if (node instanceof Widget && node.focusable && node.visible && !node.isDisabled())
          focusables.push(node);
      });
      this.focusWidget(focusables[0] ?? null);
    }
  }

  /** Remove a previously-pushed layer, restoring focus for a closed modal. */
  public removeLayer(root: OverlayRootWidget): void {
    const idx = this.layers.findIndex((l) => l.root === root);
    if (idx === -1) return;
    const [layer] = this.layers.splice(idx, 1);
    this.removeOverlay(root);
    // Only restore focus once the last modal is gone, and only to a widget still
    // attached to the tree (the previously-focused widget may have unmounted).
    if (layer.modal && !this.topModalLayer) {
      const prev = layer.previousFocus;
      this.focusWidget(prev && this.isAttached(prev) ? prev : null);
    }
  }

  /**
   * Whether `node` is reachable by walking up `.parent` links from this
   * screen — i.e. actually part of *this* screen's live tree, not merely
   * non-null. A widget can carry a stale `.parent` pointer to a different
   * screen (e.g. after a `pushScreen`/`popScreen` while a modal was open on
   * the previous one), and a bare `prev.parent` truthiness check can't tell
   * the difference.
   */
  private isAttached(node: DOMNode): boolean {
    let current: DOMNode | null = node;
    while (current) {
      if (current === this) return true;
      current = current.parent;
    }
    return false;
  }

  /**
   * Move keyboard focus to `widget` (or clear focus with `null`). By default the
   * widget is scrolled into view, which is what keyboard navigation (Tab) wants.
   * Pass `scroll: false` for pointer-driven focus: the user clicked a cell that is
   * already on screen, so scrolling the viewport would jerk content out from under
   * the cursor — and, for a read-only text selection anchored on the same press,
   * would shift the just-computed anchor away from where they clicked.
   */
  public focusWidget(widget: Widget | null, opts: { scroll?: boolean } = {}): void {
    // A disabled widget can never hold focus.
    if (widget?.isDisabled()) widget = null;
    if (this._focusedWidget === widget) return;

    if (this._focusedWidget) {
      this._focusedWidget.focused = false;
    }

    this._focusedWidget = widget;

    if (this._focusedWidget) {
      this._focusedWidget.focused = true;
      if (opts.scroll !== false) this.scrollIntoView(this._focusedWidget);
    }
  }

  private scrollIntoView(widget: Widget): void {
    let current: DOMNode | null = widget.parent;
    let child = widget;
    while (current) {
      if (current instanceof Widget) {
        const parent = current as any;
        const isScrollable = parent.scrollableX !== undefined || parent.scrollableY !== undefined;
        if (isScrollable) {
          const parentRect = parent.getContentRect();

          const childUnscrolled = new Region(
            new Offset(
              child.region.x + parent.scrollOffset.x,
              child.region.y + parent.scrollOffset.y,
            ),
            child.region.size,
          );

          let newScrollY = parent.scrollOffset.y;
          if (parent.scrollableY) {
            const contentSize = parent.getContentSize();
            const maxScrollY = Math.max(0, contentSize.height - parentRect.height);

            const y1 = childUnscrolled.y;
            const y2 = childUnscrolled.bottom;
            const v1 = parentRect.y;
            const v2 = parentRect.bottom;

            if (y1 - newScrollY < v1) {
              newScrollY = Math.max(0, y1 - v1);
            } else if (y2 - newScrollY > v2) {
              newScrollY = Math.min(maxScrollY, y2 - v2);
            }
          }

          let newScrollX = parent.scrollOffset.x;
          if (parent.scrollableX) {
            const contentSize = parent.getContentSize();
            const maxScrollX = Math.max(0, contentSize.width - parentRect.width);

            const x1 = childUnscrolled.x;
            const x2 = childUnscrolled.right;
            const v1 = parentRect.x;
            const v2 = parentRect.right;

            if (x1 - newScrollX < v1) {
              newScrollX = Math.max(0, x1 - v1);
            } else if (x2 - newScrollX > v2) {
              newScrollX = Math.min(maxScrollX, x2 - v2);
            }
          }

          if (newScrollX !== parent.scrollOffset.x || newScrollY !== parent.scrollOffset.y) {
            parent.scrollOffset = new Offset(newScrollX, newScrollY);
          }
        }
        child = current;
      }
      current = current.parent;
    }
  }

  /** Advance focus to the next focusable widget (or previous when `reverse`). */
  public focusNext(reverse = false): void {
    const widgets = this.getFocusableWidgets();
    if (widgets.length === 0) return;

    let index = -1;
    if (this._focusedWidget) {
      index = widgets.indexOf(this._focusedWidget);
    }

    if (reverse) {
      index = index <= 0 ? widgets.length - 1 : index - 1;
    } else {
      index = index === -1 || index === widgets.length - 1 ? 0 : index + 1;
    }

    this.focusWidget(widgets[index]);
  }
}
