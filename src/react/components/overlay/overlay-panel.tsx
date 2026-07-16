import { createElement, type ReactElement, type ReactNode, type RefObject } from "react";
import type { Widget, WidgetStyles } from "../../../dom/widget.ts";
import { Box } from "../layout/box.tsx";
import type { ComponentProps } from "../types.ts";

/**
 * Wraps `child` in the `ztui-overlay-root` host element every floating
 * component (Dialog/Popover/Tooltip/StickyPanel/ContextMenu) mounts onto once
 * open — the element `useLayer`'s returned ref attaches to, so the overlay
 * manager can find and position it.
 */
export function OverlayRoot({
  rootRef,
  children,
}: {
  rootRef: RefObject<Widget | null>;
  children: ReactNode;
}): ReactElement {
  return createElement("ztui-overlay-root", { ref: rootRef }, children);
}

/**
 * The common panel shape shared by Dialog/Popover/Tooltip/StickyPanel: an
 * `OverlayRoot` around a single `Box` whose style layers the component's own
 * default panel look under caller overrides (`panelStyle`, then `style`).
 * `ContextMenu` doesn't use this — its content is a `ztui-menu-list`, not a
 * styled `Box` — but still shares `OverlayRoot` above.
 */
export function OverlayPanel({
  rootRef,
  defaultPanelStyle,
  panelStyle,
  style,
  children,
  ...rest
}: ComponentProps & {
  rootRef: RefObject<Widget | null>;
  defaultPanelStyle: WidgetStyles;
  panelStyle?: WidgetStyles;
}): ReactElement {
  return (
    <OverlayRoot rootRef={rootRef}>
      <Box {...rest} style={{ ...defaultPanelStyle, ...panelStyle, ...style }}>
        {children}
      </Box>
    </OverlayRoot>
  );
}
