import { createElement, type ReactElement, type ReactNode } from "react";
import type { ComponentProps } from "../types.ts";

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
    children,
  );
}
Transcript.displayName = "Transcript";
