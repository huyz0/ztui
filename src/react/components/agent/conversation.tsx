import { type ReactElement, type ReactNode, useState } from "react";
import type { Attachment } from "../../../widgets/controls/chat/types.ts";
import type { ChatHint } from "../../../widgets/controls/chat-input.ts";
import { ChatInput, type ChatInputProps, formatChatHints } from "../controls/chat-input.tsx";
import { HBox } from "../layout/hbox.tsx";
import { VBox } from "../layout/vbox.tsx";
import { Label } from "../text/label.tsx";
import type { ComponentProps } from "../types.ts";
import { Transcript } from "./transcript.tsx";

export interface ConversationProps extends ComponentProps {
  /** The turns — `ChatBubble`/`ToolRender`/`Reasoning`/… rendered in the transcript. */
  children: ReactNode;
  /** Pin to the newest turn until the user scrolls up (and re-pin on return). Default `true`. */
  followTail?: boolean;

  /** Hide the composer for a read-only transcript view. */
  readOnly?: boolean;
  /** Hint shown in the empty composer. */
  placeholder?: string;
  /** True while the agent is generating — shows the composer's in-border stop affordance. */
  busy?: boolean;
  /** Called when the user sends a turn. */
  onSubmit?: (value: string, attachments: Attachment[]) => void;
  /** Called when the user interrupts a busy agent (Esc / stop glyph). */
  onInterrupt?: () => void;
  /**
   * The long tail of {@link ChatInputProps} — triggers, commands, history,
   * ghost-text suggestions, chip serialization, submit mode, …. The top-level
   * `placeholder`/`busy`/`onSubmit`/`onInterrupt` take precedence over the same
   * keys here.
   */
  composer?: Partial<ChatInputProps>;

  /** Optional region above the transcript (e.g. a title bar). */
  header?: ReactNode;
  /** Optional region between the transcript and the composer (e.g. a `UsageMeter`). */
  footer?: ReactNode;
  /**
   * Auto-render the composer's contextual hint line beneath it. Default `true`.
   * The component tracks the live hints itself — no `onHintsChange` plumbing.
   */
  showHints?: boolean;
  /** Extra hints appended to the auto-rendered hint line. */
  extraHints?: ChatHint[];
  /**
   * Slot pinned to the **left** of the hint line, on the same row — for a status
   * glyph, a connection `Pill`, a mode badge, etc.
   */
  hintLeading?: ReactNode;
  /**
   * Slot pinned to the **right** of the hint line, on the same row — for a model
   * name, a `UsageMeter`, a token-rate readout, etc. A `1fr` spacer separates it
   * from the hints, so it hugs the right edge.
   */
  hintTrailing?: ReactNode;
}

/**
 * The agent chat shell: a tail-following {@link Transcript} of turns with a
 * docked {@link ChatInput} composer below it. It owns the layout and the
 * submit / interrupt / busy / hint-line wiring, so an app only supplies the
 * turns (as children) and a few handlers — no manual hint state, spacer rows, or
 * scroll plumbing. Stateless by design: the app keeps the message list and busy
 * flag; this component just lays them out and routes events.
 *
 * ```tsx
 * <Conversation busy={busy} onSubmit={send} onInterrupt={stop}
 *   footer={<UsageMeter variant="compact" turn={turn} />}>
 *   {turns.map((t) => <ChatBubble key={t.id} role={t.role}>{t.text}</ChatBubble>)}
 * </Conversation>
 * ```
 */
export function Conversation({
  children,
  followTail = true,
  readOnly = false,
  placeholder,
  busy,
  onSubmit,
  onInterrupt,
  composer,
  header,
  footer,
  showHints = true,
  extraHints,
  hintLeading,
  hintTrailing,
  ...rest
}: ConversationProps): ReactElement {
  const [hints, setHints] = useState<ChatHint[]>([]);

  const hintLine = showHints && !readOnly ? formatChatHints([...hints, ...(extraHints ?? [])]) : "";
  // The status row exists if the auto hints OR either slot has content.
  const hasLeading = hintLeading != null && hintLeading !== false;
  const hasTrailing = hintTrailing != null && hintTrailing !== false;
  const showStatusRow = !!hintLine || hasLeading || hasTrailing;

  return (
    <VBox {...rest} style={{ width: "100%", height: "100%", ...rest.style }}>
      {header}
      <Transcript followTail={followTail} style={{ height: "1fr" }}>
        {children}
      </Transcript>
      {footer}
      {readOnly ? undefined : (
        <ChatInput
          {...composer}
          placeholder={placeholder ?? composer?.placeholder}
          busy={busy}
          onSubmit={onSubmit}
          onInterrupt={onInterrupt}
          onHintsChange={(h) => {
            composer?.onHintsChange?.(h);
            if (showHints) setHints(h);
          }}
        />
      )}
      {showStatusRow ? (
        <HBox style={{ width: "100%", height: 1 }}>
          {hasLeading ? <HBox style={{ padding: { right: 1 } }}>{hintLeading}</HBox> : undefined}
          <Label
            markup
            style={{ flexGrow: 1, color: "$dimmed", padding: { left: hasLeading ? 0 : 1 } }}
          >
            {hintLine}
          </Label>
          {hasTrailing ? <HBox style={{ padding: { left: 1 } }}>{hintTrailing}</HBox> : undefined}
        </HBox>
      ) : undefined}
    </VBox>
  );
}
Conversation.displayName = "Conversation";
