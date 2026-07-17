import {
  Children,
  cloneElement,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import type { ComponentProps } from "../types.ts";
import { ChatBubble, type ChatBubbleProps } from "./chat-bubble.tsx";

export interface TranscriptProps extends ComponentProps {
  /**
   * Pin to the bottom as new turns arrive, until the user scrolls up — and
   * resume once they scroll back to the bottom. Defaults to `true`. Set `false`
   * for a static, freely-scrolled history.
   */
  followTail?: boolean;
  /** The turns — `ChatBubble`s, `ToolRender`s, `Reasoning`s, anything. */
  children: ReactNode;
}

/**
 * Insert a blank line above each `ChatBubble` whose role differs from the
 * previous `ChatBubble` sibling — consecutive turns from the same speaker
 * stay tight, a role switch gets a visual break. Non-`ChatBubble` children
 * (a `ToolRender`, a `Reasoning`) reset the run: whatever `ChatBubble` comes
 * after one always gets the gap.
 */
function withRoleSpacing(children: ReactNode): ReactNode {
  let prevRole: ChatBubbleProps["role"] | undefined;
  let isFirst = true;
  return Children.map(children, (child) => {
    if (!isValidElement(child) || child.type !== ChatBubble) {
      prevRole = undefined; // force a gap before the next bubble, even same-role
      return child;
    }
    const props = child.props as ChatBubbleProps;
    const role = props.role ?? "assistant";
    const needsGap = !isFirst && prevRole !== role;
    prevRole = role;
    isFirst = false;
    if (!needsGap) return child;
    return cloneElement(child, {
      style: { margin: { top: 1 }, ...props.style },
    } as Partial<ChatBubbleProps>);
  });
}

/**
 * The scrollback container for an agent conversation: a vertical, scrollable
 * region that **tails** — it stays pinned to the latest turn as content streams
 * in, until the user scrolls up to read history (and re-pins when they return to
 * the bottom). Fills its parent; drop your turn components inside.
 *
 * ```tsx
 * <Transcript style={{ height: "1fr" }}>
 *   <ChatBubble role="user">…</ChatBubble>
 *   <ChatBubble role="assistant">…</ChatBubble>
 *   <ToolRender call={…} />
 * </Transcript>
 * ```
 */
export function Transcript({
  followTail = true,
  children,
  ...rest
}: TranscriptProps): ReactElement {
  return createElement(
    "ztui-scrollable-box",
    {
      ...rest,
      followTail,
      style: {
        width: "100%",
        height: "100%",
        layout: "vertical",
        overflowY: "auto",
        // Vertical scroll only: clamp turns to the viewport width so long
        // messages word-wrap instead of overflowing into a horizontal scroll.
        overflowX: "hidden",
        ...rest.style,
      },
    },
    withRoleSpacing(children),
  );
}
Transcript.displayName = "Transcript";
