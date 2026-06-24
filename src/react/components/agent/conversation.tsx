import { type ReactElement, type ReactNode, useState } from "react";
import type { Attachment } from "../../../widgets/controls/chat/types.ts";
import type { ChatHint } from "../../../widgets/controls/chat-input.ts";
import { ChatInput, type ChatInputProps, formatChatHints } from "../controls/chat-input.tsx";
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
  ...rest
}: ConversationProps): ReactElement {
  const [hints, setHints] = useState<ChatHint[]>([]);

  const hintLine = showHints && !readOnly ? formatChatHints([...hints, ...(extraHints ?? [])]) : "";

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
      {hintLine ? (
        <Label markup style={{ height: 1, color: "$dimmed", padding: { left: 1 } }}>
          {hintLine}
        </Label>
      ) : undefined}
    </VBox>
  );
}
Conversation.displayName = "Conversation";
