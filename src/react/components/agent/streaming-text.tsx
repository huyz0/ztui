import type { ReactElement, ReactNode } from "react";
import { Spinner } from "../feedback/spinner.tsx";
import { HBox } from "../layout/hbox.tsx";
import { Label } from "../text/label.tsx";
import type { ComponentProps } from "../types.ts";

export interface StreamingTextProps extends ComponentProps {
  /** Whether tokens are still arriving — shows a blinking caret at the end. */
  streaming?: boolean;
  /** Caret glyph. Defaults to `"▋"`. */
  caret?: string;
  /** Blink period in ms. Defaults to `530`. */
  blinkMs?: number;
  /** The text so far — a string (rendered inline) or your own nodes. */
  children: ReactNode;
}

/**
 * Inline text with a **blinking caret** while it streams — the token-by-token
 * "typing" affordance for an assistant reply. Pass the accumulated text and flip
 * `streaming` to `false` when the turn completes; the caret then disappears. The
 * caret animates itself off the render clock (no ticking prop).
 *
 * ```tsx
 * <StreamingText streaming={!done}>{reply}</StreamingText>
 * ```
 *
 * For rich replies, render Markdown above and use this only for the live tail,
 * or drop a bare `<StreamingText streaming> {""} </StreamingText>` as a cursor.
 */
export function StreamingText({
  streaming = false,
  caret = "▋",
  blinkMs = 530,
  children,
  ...rest
}: StreamingTextProps): ReactElement {
  const isText = typeof children === "string" || typeof children === "number";
  return (
    <HBox {...rest} style={{ width: "100%", ...rest.style }}>
      {isText ? (
        // Word-wrap the accumulated text so a long reply reflows to the bubble
        // width instead of clipping; `flexGrow` lets it take the row's width.
        <Label wrap style={{ flexGrow: 1 }}>
          {children}
        </Label>
      ) : (
        children
      )}
      {streaming ? (
        <Spinner frames={[caret, " "]} interval={blinkMs} style={{ color: "$dimmed" }} />
      ) : undefined}
    </HBox>
  );
}
StreamingText.displayName = "StreamingText";
