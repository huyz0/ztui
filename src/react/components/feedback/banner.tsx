import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

/** Semantic tone of a {@link Banner}. Sets the icon and accent colour together. */
export type BannerVariant = "info" | "success" | "warning" | "error" | "neutral";

/** Glyph vocabulary for the leading icon. `emoji` is two cells wide. */
export type BannerGlyphSet = "unicode" | "ascii" | "emoji";

/** Props for {@link Banner}. */
export interface BannerProps extends ComponentProps {
  /** Semantic tone — picks the icon and theme-resolved accent. Default `info`. */
  variant?: BannerVariant;
  /** Optional bold heading shown on the first line. */
  title?: string;
  /** Body text; word-wrapped to the available width. */
  message?: string;
  /** Icon vocabulary. Default `unicode`. */
  glyphSet?: BannerGlyphSet;
  /** Draw the leading variant icon. Default true. */
  showIcon?: boolean;
  /** Tint the background toward the accent. Default true. */
  fill?: boolean;
  /** Show a clickable `×` at the top-right. */
  dismissible?: boolean;
  /** Called when the `×` is clicked (only when {@link dismissible}). */
  onDismiss?: () => void;
}

/**
 * A persistent inline callout — accent rule, icon, optional bold title and a
 * word-wrapped message — for a state the user should notice without it stealing
 * focus or auto-dismissing like a toast. Five semantic variants drive the icon
 * and a theme-resolved accent; it stretches to its container width and sizes its
 * own height from the wrapped message.
 *
 * ```tsx
 * <Banner variant="warning" title="Unsaved changes" message="Your edits will be lost." />
 * <Banner variant="success" message="Deployed." dismissible onDismiss={hide} />
 * ```
 */
export const Banner = hostComponent<BannerProps>("ztui-banner");
