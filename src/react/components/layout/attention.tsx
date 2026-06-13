import { createElement, type ReactElement } from "react";
import type { ComponentProps } from "../types.ts";

export interface AttentionProps extends ComponentProps {
  /**
   * Whether the panel pulses for attention. Default `true`. Set `false` to leave
   * it a plain bordered box (e.g. once the decision has been made).
   */
  attentive?: boolean;
  /** Optional title drawn into the top border edge. */
  title?: string;
}

/**
 * A bordered panel whose border *breathes* with the `$attention` accent to pull
 * the eye toward a decision the user needs to make — a permission prompt, a Q&A,
 * a confirm step. Louder than the ambient focus breathing and independent of
 * focus: it pulses to say "look here", not "you are here".
 *
 * With motion disabled (reduced-motion / tests) it shows a static `$attention`
 * border, so the urgency still reads without movement.
 *
 * ```tsx
 * <Attention title="Permission required" style={{ padding: 1 }}>
 *   <Label>Allow access to the clipboard?</Label>
 *   <HBox>
 *     <Button onClick={allow}>Allow</Button>
 *     <Button onClick={deny}>Deny</Button>
 *   </HBox>
 * </Attention>
 * ```
 */
export function Attention({ children, ...props }: AttentionProps): ReactElement {
  return createElement("ztui-attention", props, children);
}
Attention.displayName = "Attention";
