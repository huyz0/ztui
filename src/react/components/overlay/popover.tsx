import type { ReactElement, RefObject } from "react";
import type { OverlayPlacement } from "../../../dom/overlay.ts";
import type { Widget, WidgetStyles } from "../../../dom/widget.ts";
import type { ComponentProps } from "../types.ts";
import { OverlayPanel } from "./overlay-panel.tsx";
import { useLayer } from "./use-layer.ts";

export interface PopoverProps extends ComponentProps {
  /** Whether the popover is shown. Defaults to `true`. */
  open?: boolean;
  /** Called when the popover asks to close (Esc or outside click). */
  onClose?: () => void;
  /** The trigger to attach to: a ref obtained from the anchoring widget. */
  anchorRef: RefObject<Widget | null>;
  /** Preferred side of the anchor (default `bottom`); flips to fit, else best-fit. */
  placement?: OverlayPlacement;
  /** Esc dismisses the popover. Defaults to `true`. */
  closeOnEscape?: boolean;
  /** Clicking outside dismisses the popover. Defaults to `true`. */
  closeOnOutsideClick?: boolean;
  /** Style overrides for the panel box. */
  panelStyle?: WidgetStyles;
}

const DEFAULT_PANEL: WidgetStyles = {
  border: "rounded",
  background: "$panel",
  color: "$foreground",
  padding: 1,
};

/**
 * A floating panel anchored to a trigger widget — a richer dropdown for
 * arbitrary content (forms, lists, details). It floats on an overlay layer
 * placed beside the anchor on the best-fitting side (see {@link placement}),
 * grabs focus so its controls are keyboard-reachable, and dismisses on Esc or an
 * outside click. Drive {@link PopoverProps.open} yourself:
 *
 * ```tsx
 * const ref = useRef<Widget>(null);
 * const [open, setOpen] = useState(false);
 * <Button ref={ref} onClick={() => setOpen((v) => !v)}>Details</Button>
 * <Popover open={open} anchorRef={ref} onClose={() => setOpen(false)}>
 *   <Label>Anything goes here.</Label>
 * </Popover>
 * ```
 */
export function Popover({
  open = true,
  onClose,
  anchorRef,
  placement = "bottom",
  closeOnEscape = true,
  closeOnOutsideClick = true,
  panelStyle,
  style,
  children,
  ...rest
}: PopoverProps): ReactElement | null {
  const rootRef = useLayer({
    open,
    modal: true,
    centered: false,
    dim: false,
    passThrough: false,
    closeOnEscape,
    closeOnOutsideClick,
    onClose,
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
