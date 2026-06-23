import type { ReactElement, ReactNode } from "react";
import { Box } from "../layout/box.tsx";
import { HBox } from "../layout/hbox.tsx";
import { VBox } from "../layout/vbox.tsx";
import { Label } from "../text/label.tsx";
import type { ComponentProps } from "../types.ts";
import {
  accentStyle,
  DEFAULT_ROLE_BACKGROUNDS,
  type MessageAccent,
  type MessageRole,
  resolveAccent,
} from "./roles.ts";

export interface ChatBubbleProps extends ComponentProps {
  /**
   * Who the message is from. Selects the default accent (colour/side/weight) and
   * the author colour. Defaults to `"assistant"`. See {@link DEFAULT_ROLE_ACCENTS}.
   */
  role?: MessageRole;
  /**
   * Optional author label shown bold above the body in the accent colour. Omit
   * it (the default) to let the accent bar + background carry the sender — no
   * "You / Assistant / Tool" caption needed.
   */
  author?: string;
  /** Optional leading icon beside the author (a `HeroIcon`, emoji `Label`, …). */
  icon?: ReactNode;
  /**
   * Override any part of the role's accent — colour, side, or weight. e.g.
   * `accent={{ color: "#7db4ff" }}` for a literal light blue, or
   * `accent={{ side: "left" }}` to move a user bar to the leading edge.
   */
  accent?: Partial<MessageAccent>;
  /** Bubble fill. Defaults to the role's tint ({@link DEFAULT_ROLE_BACKGROUNDS}); `null` = none. */
  background?: string | null;
  /** Message body — text, Markdown, a `ToolCall`, anything. */
  children: ReactNode;
}

/**
 * A transcript message bubble: a one-sided accent bar (colour = sender), an
 * optional author header with an icon, and the message body. Roles supply
 * sensible defaults — the human prompt gets a warm bar on the right, the
 * assistant a cool bar on the left, tool output a muted bar — and every facet is
 * overridable via {@link ChatBubbleProps.accent}, so it stays a generic
 * primitive rather than a fixed four-role widget.
 *
 * ```tsx
 * <ChatBubble role="user" author="You">Run the tests?</ChatBubble>
 * <ChatBubble role="assistant" author="Claude">On it.</ChatBubble>
 * <ChatBubble role="tool" author="Bash" icon={<Label>🖥️</Label>}>
 *   <ToolCall name="Bash" args="npm test" summary="ok" />
 * </ChatBubble>
 * ```
 */
export function ChatBubble({
  role = "assistant",
  author,
  icon,
  accent,
  background,
  children,
  ...rest
}: ChatBubbleProps): ReactElement {
  // Default to the role's tint; an explicit `background` (incl. null) wins.
  const fill = background === undefined ? DEFAULT_ROLE_BACKGROUNDS[role] : background;
  const resolved = resolveAccent(role, accent);
  const hasIcon = icon != null && icon !== false;
  // A spoken turn (you / the assistant) gets a trailing blank line *inside* the
  // bubble — bottom padding, not margin, so the accent bar runs through it and
  // the turn reads as a closed block. Tool/system output stays tight.
  const padBottom = role === "user" || role === "assistant" ? 1 : 0;

  return (
    <VBox
      {...rest}
      style={{
        ...accentStyle(resolved),
        ...(fill != null ? { background: fill } : {}),
        padding: { left: 1, right: 1, bottom: padBottom },
        ...rest.style,
      }}
    >
      {author || hasIcon ? (
        <HBox style={{ width: "100%", height: 1 }}>
          {hasIcon ? <Box style={{ padding: { right: 1 } }}>{icon}</Box> : undefined}
          {author ? (
            <Label style={{ color: resolved.color, bold: true }}>{author}</Label>
          ) : undefined}
        </HBox>
      ) : undefined}
      {children}
    </VBox>
  );
}
ChatBubble.displayName = "ChatBubble";
