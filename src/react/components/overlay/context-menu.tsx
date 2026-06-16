import { createElement, useCallback, useState } from "react";
import type { OverlayPlacement } from "../../../dom/overlay.ts";
import type { WidgetStyles } from "../../../dom/widget.ts";
import type { MenuItem } from "../../../widgets/controls/menu.ts";
import { useLayer } from "./use-layer.ts";

export type { MenuItem, OverlayPlacement };

export interface ContextMenuProps {
  /** Whether the menu is shown. */
  open: boolean;
  /** Screen column to anchor the menu's top-left at (clamped on-screen). */
  x: number;
  /** Screen row to anchor the menu's top-left at (clamped on-screen). */
  y: number;
  /** The action rows. */
  items: MenuItem[];
  /** Called with the chosen row; the menu also closes via {@link onClose}. */
  onSelect?: (item: MenuItem, index: number) => void;
  /** Called when the menu asks to close (selection, Esc, or outside click). */
  onClose?: () => void;
  /** Esc dismisses the menu. Defaults to `true`. */
  closeOnEscape?: boolean;
  /**
   * Which side of the point to prefer. `auto` (default) opens below and flips
   * across top/right/left to whichever side fits, else best-fit — always
   * clamped on-screen.
   */
  placement?: OverlayPlacement;
  /** Style overrides for the menu box (e.g. `minWidth`). */
  menuStyle?: WidgetStyles;
}

/**
 * A floating action menu pinned to a point — the classic right-click / overflow
 * menu. It floats on a modal overlay layer that grabs focus (so ↑/↓/Enter drive
 * it), positions its top-left at ({@link ContextMenuProps.x}, {@link y}) clamped
 * fully on-screen, and dismisses on selection, Esc, or an outside click.
 *
 * Drive `open`/`x`/`y` yourself or, more simply, with {@link useContextMenu}:
 *
 * ```tsx
 * const menu = useContextMenu();
 * <Box onMouseDown={(ev) => ev.button === "right" && menu.openAt(ev.x, ev.y)}>…</Box>
 * <ContextMenu
 *   {...menu.props}
 *   items={[
 *     { label: "Copy", shortcut: "Ctrl+C" },
 *     { separator: true },
 *     { label: "Delete", danger: true },
 *   ]}
 *   onSelect={(item) => run(item)}
 * />
 * ```
 */
export function ContextMenu({
  open,
  x,
  y,
  items,
  onSelect,
  onClose,
  closeOnEscape = true,
  placement = "auto",
  menuStyle,
}: ContextMenuProps) {
  const rootRef = useLayer({
    open,
    modal: true,
    centered: false,
    dim: false,
    passThrough: false,
    closeOnEscape,
    closeOnOutsideClick: true,
    onClose,
    // Anchor at the click point, flipping to whichever side fits (see placement).
    point: { x, y },
    placement,
  });

  if (!open) return null;

  return createElement(
    "ztui-overlay-root",
    { ref: rootRef },
    createElement("ztui-menu-list", {
      items,
      style: menuStyle,
      onSelect: (item: MenuItem, index: number) => {
        onSelect?.(item, index);
        onClose?.();
      },
    }),
  );
}

/**
 * State helper for {@link ContextMenu}: tracks open/position and exposes
 * `openAt(x, y)` / `close`. Spread `props` onto `<ContextMenu>`:
 *
 * ```tsx
 * const menu = useContextMenu();
 * <ContextMenu {...menu.props} items={items} onSelect={run} />
 * ```
 */
export function useContextMenu(): {
  /** Props to spread onto `<ContextMenu>` (`open`, `x`, `y`, `onClose`). */
  props: { open: boolean; x: number; y: number; onClose: () => void };
  open: boolean;
  /** Open the menu with its top-left at screen cell (`x`, `y`). */
  openAt: (x: number, y: number) => void;
  /** Close the menu. */
  close: () => void;
} {
  const [state, setState] = useState({ open: false, x: 0, y: 0 });
  const openAt = useCallback((x: number, y: number) => setState({ open: true, x, y }), []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  return {
    props: { open: state.open, x: state.x, y: state.y, onClose: close },
    open: state.open,
    openAt,
    close,
  };
}
