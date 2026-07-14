import { type ReactElement, type ReactNode, useState } from "react";
import { Box } from "../layout/box.tsx";
import { HBox } from "../layout/hbox.tsx";
import { VBox } from "../layout/vbox.tsx";
import { Label } from "../text/label.tsx";
import type { ComponentProps } from "../types.ts";
import { accentStyle, type MessageAccent } from "./roles.ts";

/** Execution state of a tool call; drives the badge glyph and colour. */
export type ToolCallStatus = "pending" | "running" | "success" | "error";

/** Badge glyph + theme colour token for each {@link ToolCallStatus}. */
const STATUS_BADGE: Record<ToolCallStatus, { glyph: string; color: string }> = {
  pending: { glyph: "○", color: "$dimmed" },
  running: { glyph: "◐", color: "$accent" },
  success: { glyph: "✔", color: "$success" },
  error: { glyph: "✖", color: "$error" },
};

const DISCLOSURE = { closed: "▸", open: "▾" } as const;

export interface ToolCallProps extends ComponentProps {
  /** Tool name shown in the header, e.g. `"Read"` or `"Bash"`. */
  name: string;
  /**
   * Optional leading icon for the tool — any node (a `HeroIcon`, `FileIcon`, an
   * emoji `Label`, …). Sits between the status badge and the name. Omit for none.
   */
  icon?: ReactNode;
  /** One-line argument preview, dimmed after the name (e.g. the file path). */
  args?: string;
  /**
   * Optional one-sided accent bar around the whole card (colour = which tool /
   * source, like a chat bubble). Omit for a plain card. Defaults the side/weight
   * when only a colour is given.
   */
  accent?: Partial<MessageAccent>;
  /** Execution status; drives the badge glyph and colour. Defaults to `"success"`. */
  status?: ToolCallStatus;
  /**
   * One-line result preview shown in the header while collapsed (e.g.
   * `"42 lines"` or `"exit 0"`), so the call reads at a glance without expanding.
   */
  summary?: string;
  /** Controlled open state. Omit to let the component manage it internally. */
  open?: boolean;
  /** Initial open state when uncontrolled. Defaults to `false`. */
  defaultOpen?: boolean;
  /** Fired with the next open state when the user toggles the header. */
  onToggle?: (open: boolean) => void;
  /** The result body, revealed when expanded — a diff, syntax block, text, … */
  children?: ReactNode;
}

/**
 * A collapsible tool-call card for agent transcripts: a one-line header with a
 * status badge, the tool name, a dimmed argument preview, and (while collapsed)
 * a result summary — clicking the header reveals the full result body below.
 *
 * Works controlled (pass `open` + `onToggle`) or uncontrolled (`defaultOpen`).
 * The body stays mounted while collapsed, so a streaming result keeps updating
 * behind the fold. Compose it with `Diff`, `Syntax`, `Markdown`, or plain text.
 *
 * ```tsx
 * <ToolCall name="Read" args="src/app.ts" status="success" summary="120 lines">
 *   <Syntax language="ts">{fileText}</Syntax>
 * </ToolCall>
 * ```
 */
export function ToolCall({
  name,
  icon,
  args,
  status = "success",
  summary,
  accent,
  open,
  defaultOpen = false,
  onToggle,
  children,
  ...rest
}: ToolCallProps): ReactElement {
  const [internal, setInternal] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internal;

  const toggle = () => {
    const next = !isOpen;
    if (!isControlled) setInternal(next);
    onToggle?.(next);
  };

  const badge = STATUS_BADGE[status];
  const hasBody = children != null && children !== false;
  const disclosure = !hasBody ? " " : isOpen ? DISCLOSURE.open : DISCLOSURE.closed;
  // An accent bar pads the card off its bar by one cell on that side.
  const accentBar = accent?.color
    ? { ...accentStyle({ side: "left", weight: "thin", ...accent } as MessageAccent) }
    : undefined;
  const accentPad = accent?.color
    ? accent.side === "right"
      ? { right: 1 }
      : { left: 1 }
    : undefined;

  return (
    <VBox {...rest} style={{ ...accentBar, padding: accentPad, ...rest.style }}>
      {/* Header row: clickable, the whole strip toggles. */}
      <HBox onClick={hasBody ? toggle : undefined} style={{ width: "100%", height: 1 }}>
        <Label style={{ color: "$dimmed", width: 1 }}>{disclosure}</Label>
        <Label style={{ color: badge.color, width: 2 }}>{badge.glyph} </Label>
        {icon != null && icon !== false ? (
          <Box style={{ padding: { right: 1 } }}>
            {typeof icon === "string" ? <Label>{icon}</Label> : icon}
          </Box>
        ) : undefined}
        <Label style={{ bold: true }}>{name}</Label>
        {args ? (
          <Label style={{ color: "$dimmed", padding: { left: 1 } }}>{args}</Label>
        ) : undefined}
        {/* A flexible spacer pushes the summary to the right edge while collapsed. */}
        {summary && !isOpen ? (
          <>
            <Box style={{ width: "1fr" }} />
            <Label style={{ color: "$dimmed", padding: { right: 1 } }}>{summary}</Label>
          </>
        ) : undefined}
      </HBox>
      {/* Body: indented under the badge, revealed when open. Stacks so a
          multi-line result (several Labels, a diff + caption, …) lays out
          vertically rather than overlapping. */}
      {hasBody ? (
        // Stays mounted while collapsed (visible={false} just skips paint/
        // layout), so a streaming result keeps updating behind the fold
        // instead of losing its internal state (scroll position, buffered
        // lines, …) every time the card is collapsed.
        <VBox visible={isOpen} style={{ padding: { left: 3 }, width: "100%" }}>
          {children}
        </VBox>
      ) : undefined}
    </VBox>
  );
}
ToolCall.displayName = "ToolCall";
