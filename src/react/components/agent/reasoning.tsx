import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";
import { Spinner } from "../feedback/spinner.tsx";
import { Box } from "../layout/box.tsx";
import { HBox } from "../layout/hbox.tsx";
import { VBox } from "../layout/vbox.tsx";
import { Label } from "../text/label.tsx";
import type { ComponentProps } from "../types.ts";

const DISCLOSURE = { closed: "▸", open: "▾" } as const;

export interface ReasoningProps extends ComponentProps {
  /** Header label. Defaults to `"Thinking"`. */
  label?: string;
  /**
   * Whether the model is still reasoning. While true a live spinner shows and
   * the block stays expanded; flips drive auto-expand / {@link collapseWhenDone}.
   */
  active?: boolean;
  /** Shown dimmed in the header once done, e.g. `"thought for 3s"`. */
  duration?: string;
  /** Controlled open state. Omit to let the component manage it. */
  open?: boolean;
  /** Initial open state when uncontrolled. Defaults to whether it starts `active`. */
  defaultOpen?: boolean;
  /** Fired with the next open state when the user toggles the header. */
  onToggle?: (open: boolean) => void;
  /** Collapse automatically when `active` turns false. Defaults to `false`. */
  collapseWhenDone?: boolean;
  /** The reasoning text — Markdown or plain, streamed in as it arrives. */
  children?: ReactNode;
}

/**
 * A collapsible "thinking" block for an agent transcript: a dim header with a
 * brain glyph, a live spinner while the model is reasoning, and the (streaming)
 * reasoning text below — secondary chrome that folds away. Expands while
 * `active`, and optionally collapses itself when reasoning finishes
 * (`collapseWhenDone`), leaving just a `"thought for 3s"` line.
 *
 * Works controlled (`open` + `onToggle`) or uncontrolled (`defaultOpen`). The
 * body stays mounted while collapsed, so streamed text keeps accruing behind it.
 *
 * ```tsx
 * <Reasoning active={thinking} duration={thinking ? undefined : "3s"}>
 *   <Markdown trimTrailingMargin>{reasoningText}</Markdown>
 * </Reasoning>
 * ```
 */
export function Reasoning({
  label = "Thinking",
  active = false,
  duration,
  open,
  defaultOpen,
  onToggle,
  collapseWhenDone = false,
  children,
  ...rest
}: ReasoningProps): ReactElement {
  const [internal, setInternal] = useState(defaultOpen ?? active);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internal;

  // Auto expand/collapse on the active→done transition (uncontrolled only).
  const prevActive = useRef(active);
  useEffect(() => {
    if (prevActive.current !== active) {
      if (!isControlled) {
        if (active) setInternal(true);
        else if (collapseWhenDone) setInternal(false);
      }
      prevActive.current = active;
    }
  }, [active, collapseWhenDone, isControlled]);

  const toggle = () => {
    const next = !isOpen;
    if (!isControlled) setInternal(next);
    onToggle?.(next);
  };

  const hasBody = children != null && children !== false;
  const disclosure = !hasBody ? " " : isOpen ? DISCLOSURE.open : DISCLOSURE.closed;

  return (
    <VBox {...rest}>
      {/* Header: dim, clickable, the whole strip toggles. */}
      <HBox onClick={hasBody ? toggle : undefined} style={{ width: "100%", height: 1 }}>
        <Label style={{ color: "$dimmed", width: 1 }}>{disclosure}</Label>
        <Label style={{ color: "$dimmed", width: 2 }}>✻ </Label>
        <Label style={{ color: "$dimmed", italic: true }}>{label}</Label>
        {active ? (
          <Box style={{ padding: { left: 1 } }}>
            <Spinner mode="blink" />
          </Box>
        ) : duration ? (
          <Label style={{ color: "$dimmed", padding: { left: 1 } }}>{duration}</Label>
        ) : undefined}
      </HBox>
      {/* Body: indented, dim — reasoning is secondary chrome. */}
      {hasBody && isOpen ? (
        <VBox style={{ padding: { left: 3 }, width: "100%", color: "$dimmed" }}>{children}</VBox>
      ) : undefined}
    </VBox>
  );
}
Reasoning.displayName = "Reasoning";
