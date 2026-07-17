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
  /**
   * Where the bubble sits within the conversation panel. `"full"` (the
   * default) spans the panel's full width, as today. `"left"`/`"right"`
   * shrinks the bubble to fit its text (capped at {@link maxWidth}) and
   * pushes it to that edge — iMessage-style, useful when user/assistant
   * turns should visually split the panel instead of stacking as
   * full-width blocks.
   */
  align?: "left" | "right" | "full";
  /** Bubble width cap when {@link align} is `"left"`/`"right"`: cells or a `"%"` string. Defaults to `"75%"`. */
  maxWidth?: string | number;
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
  align = "full",
  maxWidth = "75%",
  children,
  ...rest
}: ChatBubbleProps): ReactElement {
  // Default to the role's tint; an explicit `background` (incl. null) wins.
  const fill = background === undefined ? DEFAULT_ROLE_BACKGROUNDS[role] : background;
  const resolved = resolveAccent(role, accent);
  const hasIcon = icon != null && icon !== false;
  // Plain string/number children are wrapped in a word-wrapping Label so the
  // documented `<ChatBubble>text</ChatBubble>` shorthand renders (and reflows)
  // instead of silently dropping a bare text node into a layout box.
  const body =
    typeof children === "string" || typeof children === "number" ? (
      <Label wrap>{children}</Label>
    ) : (
      children
    );

  const bubble = (
    <VBox
      {...rest}
      style={{
        ...accentStyle(resolved),
        ...(fill != null ? { background: fill } : {}),
        padding: { left: 1, right: 1 },
        // Content-sized (not a fixed width) so a short "hi" doesn't stretch
        // into a wide box with trailing blank space — just capped so a long
        // message can't fill the whole panel.
        ...(align !== "full" ? { maxWidth } : {}),
        ...rest.style,
      }}
    >
      {author || hasIcon ? (
        // No `width: "100%"` here: that would resolve against the full
        // space this bubble was OFFERED (before its own content-sized/
        // maxWidth-capped width is known), stretching the header — and
        // therefore the whole bubble, since width is content's max — back
        // out to the full offered width regardless of maxWidth/align.
        <HBox style={{ height: 1 }}>
          {hasIcon ? <Box style={{ padding: { right: 1 } }}>{icon}</Box> : undefined}
          {author ? (
            <Label style={{ color: resolved.color, bold: true }}>{author}</Label>
          ) : undefined}
        </HBox>
      ) : undefined}
      {body}
    </VBox>
  );

  if (align === "full") return bubble;

  // Push the (narrower) bubble to one edge with a flexGrow spacer on the
  // other side — the standard "float" idiom in this layout system, since
  // there's no per-child cross-axis alignment on a plain container.
  return (
    <HBox style={{ width: "100%" }}>
      {align === "right" ? <VBox style={{ flexGrow: 1 }} /> : undefined}
      {bubble}
      {align === "left" ? <VBox style={{ flexGrow: 1 }} /> : undefined}
    </HBox>
  );
}
ChatBubble.displayName = "ChatBubble";
