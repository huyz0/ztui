import type { ReactElement, ReactNode } from "react";
import { HBox } from "../layout/hbox.tsx";
import { Label } from "../text/label.tsx";
import type { ComponentProps } from "../types.ts";

/** Visual style of a {@link Chip}. */
export type ChipVariant = "fill" | "bracket" | "dim";

export interface ChipProps extends ComponentProps {
  /** `"fill"` = solid block (reverse video), `"bracket"` = `[label]`, `"dim"` = muted text. Default `"fill"`. */
  variant?: ChipVariant;
  /** Accent colour token. Defaults to `"$accent"`. */
  color?: string;
  /** Leading icon — a glyph string or any node. */
  icon?: ReactNode;
  /** Makes the chip clickable (e.g. a file reference that opens). */
  onClick?: (ev: any) => void;
  /** When set, a trailing `×` removes the chip (tags, attachments). */
  onRemove?: () => void;
  /** The chip label. */
  children: ReactNode;
}

/**
 * A small inline token — a tag, mention, file reference, or attachment. `fill`
 * paints a solid colour block (terminal reverse video, so the text always
 * contrasts), `bracket` wraps the label in `[ ]`, `dim` is muted text. Add an
 * `icon`, make it clickable with `onClick`, or removable with `onRemove` (a
 * trailing `×`).
 *
 * ```tsx
 * <Chip icon="📎" onRemove={() => drop(id)}>config.json</Chip>
 * <Chip variant="bracket" color="$success">passed</Chip>
 * ```
 */
export function Chip({
  variant = "fill",
  color = "$accent",
  icon,
  onClick,
  onRemove,
  children,
  ...rest
}: ChipProps): ReactElement {
  const hasIcon = icon != null && icon !== false;
  const fill = variant === "fill";
  // `reverse` is per-cell and doesn't cascade to children, so the fill style is
  // applied to every label (not just the container) — otherwise only the
  // padding cells would carry the colour block and the text would sit on the
  // bare background. `dim` colours the muted variant.
  const textStyle = fill
    ? { color, reverse: true }
    : variant === "dim"
      ? { color, dim: true }
      : { color };
  const body = (
    <>
      {hasIcon ? <Label style={{ ...textStyle, padding: { right: 1 } }}>{icon}</Label> : undefined}
      {variant === "bracket" ? (
        <Label style={textStyle}>[{children}]</Label>
      ) : (
        <Label style={textStyle}>{children}</Label>
      )}
      {onRemove ? (
        <Label
          onClick={() => onRemove()}
          style={{ ...textStyle, dim: !fill, padding: { left: 1 } }}
        >
          ×
        </Label>
      ) : undefined}
    </>
  );

  // The container carries the fill's horizontal padding (also reversed, so the
  // colour block extends past the text by one cell each side).
  const fillStyle = fill ? { color, reverse: true, padding: { left: 1, right: 1 } } : {};

  return (
    <HBox {...rest} onClick={onClick} style={{ height: 1, ...fillStyle, ...rest.style }}>
      {body}
    </HBox>
  );
}
Chip.displayName = "Chip";

export interface PillProps extends ComponentProps {
  /** Accent colour token for the dot + label. Defaults to `"$accent"`. */
  color?: string;
  /** Leading status dot. Defaults to `true`. */
  dot?: boolean;
  /** The pill label. */
  children: ReactNode;
}

/**
 * A compact status pill: a coloured `●` dot and a label — for short states
 * ("running", "queued", "3 staged"). Lighter than a {@link Chip}; no background.
 *
 * ```tsx
 * <Pill color="$success">ready</Pill>
 * ```
 */
export function Pill({
  color = "$accent",
  dot = true,
  children,
  ...rest
}: PillProps): ReactElement {
  return (
    <HBox {...rest} style={{ height: 1, ...rest.style }}>
      {dot ? <Label style={{ color, padding: { right: 1 } }}>●</Label> : undefined}
      <Label style={{ color }}>{children}</Label>
    </HBox>
  );
}
Pill.displayName = "Pill";
