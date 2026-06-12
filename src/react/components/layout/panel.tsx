import { createElement, type ReactElement, type ReactNode } from "react";
import { Label } from "../text/label.tsx";
import type { ComponentProps } from "../types.ts";
import { Box } from "./box.tsx";

export interface PanelProps extends ComponentProps {
  /** Header glyph/icon shown left of the title (a node, e.g. an Icon/HeroIcon). */
  icon?: ReactNode;
  /** Header text (left side). A node is rendered as-is; a string is bolded. */
  title?: ReactNode;
  /** Right-aligned header content — typically action icons (split/close/…). */
  actions?: ReactNode;
  /** Header bar background. Defaults to `$panel`. */
  headerBackground?: string;
  /** Body content. */
  children?: ReactNode;
}

/**
 * A flat, borderless pane: a 1-row header bar (title on the left, actions on the
 * right, drawn on a tinted background) above a content body. The colored header
 * — rather than a box border — delineates the pane, which keeps chrome to a
 * single row and frees the top-right corner for action buttons. Drop the header
 * entirely by passing neither `title` nor `actions`.
 */
export function Panel({
  icon,
  title,
  actions,
  headerBackground = "$panel",
  children,
  ...rest
}: PanelProps): ReactElement {
  const header =
    icon === undefined && title === undefined && actions === undefined ? null : (
      <Box style={{ width: "100%", height: 1, layout: "horizontal", background: headerBackground }}>
        {icon !== undefined && (
          <Box style={{ width: 3, height: 1, padding: { left: 1 } }}>{icon}</Box>
        )}
        <Box style={{ width: "1fr", height: 1 }}>
          {typeof title === "string" ? (
            // Always a 1-col left pad: a leading margin with no icon, or a space
            // separating the title from the icon when one is present.
            <Label style={{ bold: true, padding: { left: 1 } }}>{title}</Label>
          ) : (
            title
          )}
        </Box>
        {actions}
      </Box>
    );

  return createElement(
    Box,
    { ...rest, style: { width: "100%", height: "100%", layout: "vertical", ...rest.style } },
    header,
    <Box key="body" style={{ width: "100%", height: "1fr" }}>
      {children}
    </Box>,
  );
}
