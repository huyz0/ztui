import { type ReactElement, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { OverlayPlacement } from "../../../dom/overlay.ts";
import type { Widget, WidgetStyles } from "../../../dom/widget.ts";
import type { ComponentProps } from "../types.ts";
import { OverlayPanel } from "./overlay-panel.tsx";
import { useLayer } from "./use-layer.ts";

export interface TooltipProps extends ComponentProps {
  /** Whether the tooltip is shown. */
  open?: boolean;
  /** The trigger to attach to: a ref obtained from the hovered widget. */
  anchorRef: RefObject<Widget | null>;
  /** Preferred side of the anchor (default `top`); flips to fit, else best-fit. */
  placement?: OverlayPlacement;
  /** Style overrides for the tip box. */
  panelStyle?: WidgetStyles;
}

const DEFAULT_PANEL: WidgetStyles = {
  background: "$panel",
  color: "$foreground",
  padding: { left: 1, right: 1 },
};

/**
 * A small, non-interactive hover hint anchored to a widget. It floats on a
 * pass-through, focus-free overlay layer placed beside the anchor on the
 * best-fitting side, so it never steals focus or blocks clicks. Pair it with
 * {@link useTooltip}, which wires the hover-delay open/close:
 *
 * ```tsx
 * const tip = useTooltip();
 * <Button ref={tip.ref} {...tip.triggerProps}>Save</Button>
 * <Tooltip {...tip.props}>Save your work (Ctrl+S)</Tooltip>
 * ```
 */
export function Tooltip({
  open = true,
  anchorRef,
  placement = "top",
  panelStyle,
  style,
  children,
  ...rest
}: TooltipProps): ReactElement | null {
  const rootRef = useLayer({
    open,
    modal: false,
    centered: false,
    dim: false,
    passThrough: true,
    closeOnEscape: false,
    closeOnOutsideClick: false,
    anchorRef,
    placement,
    shadow: false, // a heavy drop shadow would dwarf a one-line hint
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

/**
 * State helper for {@link Tooltip}: shows the tip after a hover `delay` and
 * hides it on leave. Attach `ref` + spread `triggerProps` on the trigger, and
 * spread `props` on `<Tooltip>`.
 */
export function useTooltip(opts: { delay?: number } = {}): {
  /** Ref to attach to the trigger widget. */
  ref: RefObject<Widget | null>;
  open: boolean;
  /** Spread on the trigger: hover handlers + hover-interest opt-in. */
  triggerProps: { onMouseEnter: () => void; onMouseLeave: () => void; hoverInterest: true };
  /** Spread on `<Tooltip>`: `open` + `anchorRef`. */
  props: { open: boolean; anchorRef: RefObject<Widget | null> };
} {
  const { delay = 400 } = opts;
  const ref = useRef<Widget | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onMouseEnter = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  }, [delay]);
  const onMouseLeave = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setOpen(false);
  }, []);
  // Clean up a pending show timer on unmount.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return {
    ref,
    open,
    triggerProps: { onMouseEnter, onMouseLeave, hoverInterest: true },
    props: { open, anchorRef: ref },
  };
}
