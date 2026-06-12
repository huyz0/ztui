import { createElement, useEffect, useState } from "react";
import type { WidgetStyles } from "../../../dom/widget.ts";
import { useAnimatedValue } from "../../use-animation.ts";
import { Box } from "../layout/box.tsx";
import type { ComponentProps } from "../types.ts";
import { useLayer } from "./use-layer.ts";

export interface DialogProps extends ComponentProps {
  /** Whether the dialog is shown. Defaults to `true`. */
  open?: boolean;
  /** Called when the dialog asks to close (Esc or outside click). */
  onClose?: () => void;
  /** Esc dismisses the dialog. Defaults to `true`. */
  closeOnEscape?: boolean;
  /** Clicking the backdrop dismisses the dialog. Defaults to `true`. */
  closeOnOutsideClick?: boolean;
  /** Blank the backdrop so the content behind reads as inert. Defaults to `false`. */
  dim?: boolean;
  /** Fade the `dim` scrim in on open rather than snapping it on. Defaults to `true`. */
  dimFade?: boolean;
  /** Style overrides for the centered panel box. */
  panelStyle?: WidgetStyles;
}

const DEFAULT_PANEL: WidgetStyles = {
  border: "rounded",
  background: "$surface",
  color: "$foreground",
  padding: 1,
  minWidth: 30,
};

/**
 * A modal dialog. While open it floats above the rest of the UI on a dedicated
 * layer that traps focus (Tab cycles only within the dialog), routes keys to the
 * dialog's own controls, and blocks the layer below from receiving keys or
 * clicks. Esc and backdrop clicks request a close via {@link DialogProps.onClose}.
 *
 * The dialog owns no open/close state — drive {@link DialogProps.open} yourself:
 *
 * ```tsx
 * const [open, setOpen] = useState(false);
 * <Button onClick={() => setOpen(true)}>Settings</Button>
 * <Dialog open={open} onClose={() => setOpen(false)}>
 *   <Label>Are you sure?</Label>
 *   <Button onClick={() => setOpen(false)}>OK</Button>
 * </Dialog>
 * ```
 */
export function Dialog({
  open = true,
  onClose,
  closeOnEscape = true,
  closeOnOutsideClick = true,
  dim = false,
  dimFade = true,
  panelStyle,
  style,
  children,
  ...rest
}: DialogProps) {
  // The dialog unmounts when closed, so we only animate the *enter*: start the
  // scrim at 0 and tween to 1 once mounted. `enter` resets to 0 on each fresh
  // mount, so reopening fades again.
  const [enter, setEnter] = useState(0);
  useEffect(() => {
    setEnter(open ? 1 : 0);
  }, [open]);
  const dimAlpha = useAnimatedValue(dim && dimFade ? enter : 1, {
    duration: 180,
    easing: "out-cubic",
  });

  const rootRef = useLayer({
    open,
    modal: true,
    centered: true,
    dim,
    dimAlpha,
    passThrough: false,
    closeOnEscape,
    closeOnOutsideClick,
    onClose,
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
