import type { RefObject } from "react";
import type { OverlayPlacement } from "../../../dom/overlay.ts";
import type { Widget, WidgetStyles } from "../../../dom/widget.ts";
import type { KeyEvent } from "../../../driver/driver.ts";
import type { ComponentProps } from "../types.ts";
import { OverlayPanel } from "./overlay-panel.tsx";
import { useLayer } from "./use-layer.ts";

export interface StickyPanelProps extends ComponentProps {
  /** Whether the panel is shown. Defaults to `true`. */
  open?: boolean;
  /**
   * Sees key events before they reach the focused control below, so the panel
   * can claim navigation keys (↑/↓/Enter) while ordinary typing still flows to
   * the focused input. Call `ev.handled = true` to consume the key; leave it
   * alone to let it pass through.
   *
   * ```tsx
   * onKeyIntercept={(ev) => {
   *   if (ev.name === "down") { moveSelection(1); ev.handled = true; }
   *   if (ev.name === "enter") { choose(); ev.handled = true; }
   * }}
   * ```
   */
  onKeyIntercept?: (ev: KeyEvent) => void;
  /** Esc dismisses the panel (calls {@link onClose}). Defaults to `true`. */
  closeOnEscape?: boolean;
  /** Called when the panel asks to close (Esc). Drive your `open` state here. */
  onClose?: () => void;
  /**
   * Anchor the panel to a widget (e.g. the chat input): pass a ref obtained from
   * that widget. The panel sits flush above or below the anchor — see
   * {@link placement} — and tracks it as the layout changes. When omitted, the
   * panel is positioned at the screen offsets in {@link panelStyle}.
   *
   * ```tsx
   * const inputRef = useRef<InputWidget>(null);
   * <Input ref={inputRef} />
   * <StickyPanel anchorRef={inputRef} placement="above">…</StickyPanel>
   * ```
   */
  anchorRef?: RefObject<Widget | null>;
  /** Side of the anchor to prefer (default `auto`: above only if below won't fit). */
  placement?: OverlayPlacement;
  /**
   * Style overrides for the panel box. Set `width` here; when not anchored, also
   * `left`/`top`/`right`/`bottom` to position it. The panel is always clamped to
   * stay fully on-screen.
   */
  panelStyle?: WidgetStyles;
}

const DEFAULT_PANEL: WidgetStyles = {
  border: "rounded",
  background: "$panel",
  color: "$foreground",
};

/**
 * A non-modal floating panel that overlays the UI without stealing focus — the
 * control below (e.g. a chat input) keeps focus and keeps receiving text. The
 * panel can be driven entirely by the mouse, and may claim specific keys via
 * {@link StickyPanelProps.onKeyIntercept} while letting the rest fall through.
 *
 * This is the building block for slash-command / `@`-mention popups: the user
 * keeps typing into the input, the panel filters its list as they type, arrow
 * keys move the highlight, and Enter confirms — all while the input stays
 * focused. Clicks outside the panel pass through to whatever is underneath.
 *
 * Attach it to the control it relates to with `anchorRef` (recommended), or
 * place it manually via `panelStyle`:
 *
 * ```tsx
 * <StickyPanel
 *   open={menuOpen}
 *   anchorRef={inputRef}
 *   placement="above"
 *   panelStyle={{ width: 30 }}
 *   onKeyIntercept={handleMenuKey}
 * >
 *   {commands.map((c) => <Label key={c}>{c}</Label>)}
 * </StickyPanel>
 * ```
 */
export function StickyPanel({
  open = true,
  onKeyIntercept,
  closeOnEscape = true,
  onClose,
  anchorRef,
  placement = "auto",
  panelStyle,
  style,
  children,
  ...rest
}: StickyPanelProps) {
  const rootRef = useLayer({
    open,
    modal: false,
    centered: false,
    dim: false,
    passThrough: true,
    closeOnEscape,
    closeOnOutsideClick: false,
    onClose,
    keyInterceptor: onKeyIntercept,
    anchorRef,
    placement,
  });

  if (!open) return null;

  return (
    <OverlayPanel
      rootRef={rootRef}
      defaultPanelStyle={DEFAULT_PANEL}
      panelStyle={panelStyle}
      style={style}
      {...rest}
    >
      {children}
    </OverlayPanel>
  );
}
