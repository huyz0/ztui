import { createElement } from "react";
import type { WidgetStyles } from "../../../dom/widget.ts";
import type { KeyEvent } from "../../../driver/driver.ts";
import { Box } from "../layout/box.tsx";
import type { ComponentProps } from "../types.ts";
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
  /** Style overrides for the panel box (position it via `left`/`top`/…). */
  panelStyle?: WidgetStyles;
}

const DEFAULT_PANEL: WidgetStyles = {
  position: "absolute",
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
 * Anchor it with `panelStyle` (it is absolutely positioned over the screen):
 *
 * ```tsx
 * <StickyPanel
 *   open={menuOpen}
 *   panelStyle={{ left: 4, bottom: 3, width: 30 }}
 *   onKeyIntercept={handleMenuKey}
 * >
 *   {commands.map((c) => <Label key={c}>{c}</Label>)}
 * </StickyPanel>
 * ```
 */
export function StickyPanel({
  open = true,
  onKeyIntercept,
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
    closeOnEscape: false,
    closeOnOutsideClick: false,
    keyInterceptor: onKeyIntercept,
  });

  if (!open) return null;

  return createElement(
    "ztui-overlay-root",
    { ref: rootRef },
    <Box {...rest} style={{ ...DEFAULT_PANEL, ...panelStyle, ...style }}>
      {children}
    </Box>,
  );
}
