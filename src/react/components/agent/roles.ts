import type { WidgetStyles } from "../../../dom/widget.ts";

/**
 * Who a transcript message is from. Drives the default accent-bar colour, side,
 * and weight — every default is overridable, so apps can add their own roles by
 * passing an explicit {@link MessageAccent}.
 */
export type MessageRole = "user" | "assistant" | "tool" | "system";

/** Which edge the accent bar hugs. */
export type AccentSide = "left" | "right";

/** Accent-bar weight: a thin rule, a heavy rule, or a solid block bar. */
export type AccentWeight = "thin" | "heavy" | "bar";

/** A single-side accent bar: the colour says *who*, the weight says *how loud*. */
export interface MessageAccent {
  /** Border colour — a `$token` (theme-aware) or a literal colour. */
  color: string;
  /** Which edge the bar hugs. */
  side: AccentSide;
  /** Bar weight. */
  weight: AccentWeight;
}

/**
 * Sensible per-role accent defaults, mirroring the convention "colour = sender":
 * the human prompt gets a warm bar on the trailing (right) edge; the assistant a
 * cool bar on the leading (left) edge; tool output a muted/silver bar; a system
 * notice a solid bar in the error colour. All are theme tokens so they adapt to
 * the active palette — spread-and-override any field via {@link MessageAccent}.
 */
export const DEFAULT_ROLE_ACCENTS: Record<MessageRole, MessageAccent> = {
  user: { color: "$warning", side: "right", weight: "heavy" },
  assistant: { color: "$accent", side: "left", weight: "heavy" },
  tool: { color: "$dimmed", side: "left", weight: "thin" },
  system: { color: "$error", side: "left", weight: "bar" },
};

/**
 * A slightly different fill per role, so human / assistant / tool turns read as
 * distinct blocks at a glance even without an author label — the bar says *who*,
 * the subtle background reinforces it. Theme tokens, so they track the palette.
 * Override per-bubble with {@link ChatBubble}'s `background` (or pass `null`).
 */
export const DEFAULT_ROLE_BACKGROUNDS: Record<MessageRole, string> = {
  user: "$panel",
  assistant: "$surface",
  tool: "$background",
  system: "$surface",
};

/**
 * Resolve a role + optional per-call overrides into a concrete accent. Pass a
 * `role` for the preset, an `override` to tweak any field, or both.
 */
export function resolveAccent(
  role: MessageRole = "assistant",
  override?: Partial<MessageAccent>,
): MessageAccent {
  return { ...DEFAULT_ROLE_ACCENTS[role], ...override };
}

/**
 * The style fragment that paints a one-sided accent bar. Only the chosen edge
 * gets a border weight; `borderColor` tints it. Spread into a container's style.
 */
export function accentStyle(accent: MessageAccent): WidgetStyles {
  const edge =
    accent.side === "right" ? { borderRight: accent.weight } : { borderLeft: accent.weight };
  return { ...edge, borderColor: accent.color };
}
