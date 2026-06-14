import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export type StatusState =
  | "active"
  | "inactive"
  | "ongoing"
  | "pending"
  | "completed"
  | "warning"
  | "failed";

export type GlyphSet = "unicode" | "ascii" | "emoji";

/** One row in a {@link StatusList}. */
export interface StatusListItem {
  /** The row's status state. */
  state: StatusState;
  /** Primary label. */
  label: string;
  /** Optional secondary text. */
  detail?: string;
}

/** Props for {@link StatusDot}. */
export interface StatusDotProps extends ComponentProps {
  /** Which lifecycle state to show. Defaults to `inactive`. */
  state?: StatusState;
  /** Glyph vocabulary. `emoji` is two cells wide — avoid it here. */
  glyphSet?: GlyphSet;
}

/**
 * A single-cell coloured status glyph. Sits inside a table cell, tree row, tab
 * title or status line. Keep it on `unicode`/`ascii`; emoji are double-width.
 */
export const StatusDot = hostComponent<StatusDotProps>("ztui-status-dot");

/** Props for {@link StatusBadge}. */
export interface StatusBadgeProps extends ComponentProps {
  /** Which lifecycle state to show. */
  state?: StatusState;
  /** Glyph vocabulary. */
  glyphSet?: GlyphSet;
  /** Text after the glyph. Defaults to the state name. */
  label?: string;
}

/** A status glyph plus a text label, e.g. `● active`. Auto-sizes to content. */
export const StatusBadge = hostComponent<StatusBadgeProps>("ztui-status-badge");

/** Props for {@link StatusList}. */
export interface StatusListProps extends ComponentProps {
  /** Rows to render, top to bottom. */
  items?: StatusListItem[];
  /** Glyph vocabulary. */
  glyphSet?: GlyphSet;
  /** Cells between the label and detail columns. Defaults to 2. */
  gap?: number;
}

/**
 * A vertical column of labelled status rows — one glyph + label (+ optional
 * dimmed detail) per line. For task runners and service dashboards.
 */
export const StatusList = hostComponent<StatusListProps>("ztui-status-list");
