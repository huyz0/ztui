import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import { parseDimension } from "../../layout/layout.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { charWidth, Segment, stringWidth } from "../../render/segment.ts";

/**
 * The lifecycle states a status indicator can report. One shared vocabulary is
 * used by every status widget (`StatusDot`, `StatusBadge`, `StatusList`) so a
 * single `state` value drives the glyph and colour consistently across them.
 *
 * - `active`    — currently on / enabled.
 * - `inactive`  — off / disabled / idle (the "light" resting state).
 * - `ongoing`   — work in progress.
 * - `pending`   — queued, not started yet.
 * - `completed` — finished successfully.
 * - `warning`   — finished or running but with issues to note.
 * - `failed`    — errored.
 */
/** A status indicator state (e.g. ok/warn/error/idle). */
export type StatusState =
  | "active"
  | "inactive"
  | "ongoing"
  | "pending"
  | "completed"
  | "warning"
  | "failed";

/**
 * Which glyph vocabulary to draw with.
 *
 * - `unicode` — single-cell symbols (the default; always 1 cell wide).
 * - `ascii`   — plain 7-bit symbols for terminals without good Unicode cover.
 * - `emoji`   — colourful emoji. These render **two cells wide** in most
 *   terminals, so they are unsuitable for the single-cell `StatusDot`; prefer
 *   them on the wider `StatusBadge` / `StatusList`.
 */
export type GlyphSet = "unicode" | "ascii" | "emoji";

const GLYPHS: Record<GlyphSet, Record<StatusState, string>> = {
  unicode: {
    active: "●",
    inactive: "○",
    ongoing: "◐",
    pending: "◌",
    // "✓" (U+2713), not "✔" (U+2714) — the latter is a real emoji codepoint
    // (default text presentation, but still colored/widened by many terminal
    // color-emoji fonts, same issue as "☑" vs "☐" in checkbox.ts); "✓" isn't
    // an emoji codepoint at all, so it stays the same weight as the other
    // (non-emoji) glyphs in this set.
    completed: "✓",
    warning: "▲",
    failed: "✘",
  },
  ascii: {
    active: "+",
    inactive: "-",
    ongoing: "*",
    pending: "~",
    completed: "v",
    warning: "!",
    failed: "x",
  },
  emoji: {
    active: "🟢",
    inactive: "⚪",
    ongoing: "🔵",
    pending: "🟡",
    completed: "✅",
    warning: "⚠️",
    failed: "❌",
  },
};

/**
 * Each state resolves its colour from a theme variable first (so a host theme
 * can recolour every status widget at once), falling back to a literal terminal
 * colour when the variable is unset.
 */
const STATE_COLOR: Record<StatusState, { variable: string; fallback: string }> = {
  active: { variable: "$success", fallback: "green" },
  inactive: { variable: "$dimmed", fallback: "bright-black" },
  ongoing: { variable: "$primary", fallback: "cyan" },
  pending: { variable: "$warning", fallback: "yellow" },
  completed: { variable: "$success", fallback: "green" },
  warning: { variable: "$warning", fallback: "yellow" },
  failed: { variable: "$error", fallback: "red" },
};

/** Resolve the glyph for a state under the active glyph set. */
export function statusGlyph(state: StatusState, glyphSet: GlyphSet = "unicode"): string {
  return GLYPHS[glyphSet][state];
}

/**
 * Resolve the colour for a state: an explicit override wins, otherwise the
 * theme variable, otherwise the literal fallback.
 */
function resolveStateColor(widget: Widget, state: StatusState, override?: string): string {
  if (override) return override;
  const { variable, fallback } = STATE_COLOR[state];
  return App.instance?.cssResolver.resolveVariable(widget, variable) || fallback;
}

/**
 * The smallest status indicator: a single coloured glyph occupying one cell
 * (two for the `emoji` set). Drop it into a table cell, tree row, tab title or
 * status line where there is no room for a label.
 */
export class StatusDotWidget extends Widget {
  /** The status to display. */
  public state: StatusState = "inactive";
  /** Glyph vocabulary. */
  public glyphSet: GlyphSet = "unicode";

  constructor() {
    super("status-dot");
    // Height is fixed at one row, but width must follow the glyph: emoji are
    // two cells wide, so pinning width to 1 clipped them to a blank. Leaving
    // width unset lets `measure` size to `charWidth(glyph)` (1 for unicode/ascii,
    // 2 for emoji); an explicit style width still overrides.
    this.defaultStyle = { height: 1 };
  }

  private get glyph(): string {
    return statusGlyph(this.state, this.glyphSet);
  }

  public override measure(maxW: number, maxH: number): void {
    const w =
      this.computedStyle.width === undefined
        ? charWidth(this.glyph)
        : parseDimension(this.computedStyle.width, maxW, charWidth(this.glyph));
    this.measuredWidth = typeof w === "number" ? w : charWidth(this.glyph);
    const h =
      this.computedStyle.height === undefined
        ? 1
        : parseDimension(this.computedStyle.height, maxH, 1);
    this.measuredHeight = typeof h === "number" ? h : 1;
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;
    super.render(buffer);

    const rect = this.getContentRect();
    if (rect.width < 1 || rect.height < 1) return;
    if (rect.y < 0 || rect.y >= buffer.height || rect.x < 0 || rect.x >= buffer.width) return;

    const bg = this.findResolvedBackground();
    const color = resolveStateColor(this, this.state, this.computedStyle.color || undefined);

    buffer.setCell(
      rect.x,
      rect.y,
      this.glyph,
      this.cachedStyle({ color, background: bg, bold: this.computedStyle.bold }),
    );
  }
}

/**
 * A status glyph followed by a text label, e.g. `● active`. Auto-sizes to its
 * content. Give it a `border` in `style` for a pill/chip look — the glyph and
 * label both take the state colour, while `style.color` (if set) overrides the
 * label colour only.
 */
export class StatusBadgeWidget extends Widget {
  /** The status to display. */
  public state: StatusState = "inactive";
  /** Glyph vocabulary. */
  public glyphSet: GlyphSet = "unicode";
  /** Text shown after the glyph. Defaults to the state name when unset. */
  public label: string | undefined = undefined;

  constructor() {
    super("status-badge");
    this.defaultStyle = { height: 1 };
  }

  private get glyph(): string {
    return statusGlyph(this.state, this.glyphSet);
  }

  private get text(): string {
    return this.label ?? this.state;
  }

  private get intrinsicWidth(): number {
    return charWidth(this.glyph) + 1 + stringWidth(this.text);
  }

  public override measure(maxW: number, maxH: number): void {
    const b = this.borderSize;
    const p = this.padding;

    if (this.computedStyle.width === undefined) {
      this.measuredWidth = this.intrinsicWidth + b.width + p.width;
    } else {
      const wVal = parseDimension(this.computedStyle.width, maxW, -1);
      this.measuredWidth =
        typeof wVal === "number" ? wVal : this.intrinsicWidth + b.width + p.width;
    }

    if (this.computedStyle.height === undefined) {
      this.measuredHeight = 1 + b.height + p.height;
    } else {
      const hVal = parseDimension(this.computedStyle.height, maxH, -1);
      this.measuredHeight = typeof hVal === "number" ? hVal : 1 + b.height + p.height;
    }
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;
    super.render(buffer);

    const rect = this.getContentRect();
    if (rect.width < 1 || rect.height < 1) return;

    const bg = this.findResolvedBackground();
    const stateColor = resolveStateColor(this, this.state);
    const labelColor = this.computedStyle.color || stateColor;

    const glyph = this.glyph;
    buffer.drawSegment(
      rect.x,
      rect.y,
      new Segment(glyph, this.cachedStyle({ color: stateColor, background: bg, bold: true })),
      rect,
    );
    buffer.drawSegment(
      rect.x + charWidth(glyph) + 1,
      rect.y,
      new Segment(
        this.text,
        this.cachedStyle({ color: labelColor, background: bg, bold: this.computedStyle.bold }),
      ),
      rect,
    );
  }
}

/** One row of a {@link StatusListWidget}. */
export interface StatusListItem {
  /** The row's status state. */
  state: StatusState;
  /** Primary text shown after the glyph. */
  label: string;
  /** Optional dimmed detail shown after the label. */
  detail?: string;
}

/**
 * A vertical column of labelled status rows — one glyph + label (+ optional
 * dimmed detail) per line. Suited to task runners and service dashboards where
 * several states are shown together.
 */
export class StatusListWidget extends Widget {
  /** Rows to render, top to bottom. */
  public items: StatusListItem[] = [];
  /** Glyph vocabulary. */
  public glyphSet: GlyphSet = "unicode";
  /** Cells between the label column and the detail column. */
  public gap = 2;

  constructor() {
    super("status-list");
  }

  private get glyphWidth(): number {
    // All glyphs in a set share a width; sample one (fall back to 1).
    return charWidth(statusGlyph("active", this.glyphSet));
  }

  private get labelColumnWidth(): number {
    let max = 0;
    for (const item of this.items) max = Math.max(max, stringWidth(item.label));
    return max;
  }

  public override measure(maxW: number, maxH: number): void {
    const b = this.borderSize;
    const p = this.padding;

    const detailWidth = this.items.reduce(
      (m, it) => Math.max(m, it.detail ? stringWidth(it.detail) : 0),
      0,
    );
    const intrinsicW =
      this.glyphWidth + 1 + this.labelColumnWidth + (detailWidth > 0 ? this.gap + detailWidth : 0);

    if (this.computedStyle.width === undefined) {
      this.measuredWidth = intrinsicW + b.width + p.width;
    } else {
      const wVal = parseDimension(this.computedStyle.width, maxW, -1);
      this.measuredWidth = typeof wVal === "number" ? wVal : intrinsicW + b.width + p.width;
    }

    if (this.computedStyle.height === undefined) {
      this.measuredHeight = this.items.length + b.height + p.height;
    } else {
      const hVal = parseDimension(this.computedStyle.height, maxH, -1);
      this.measuredHeight =
        typeof hVal === "number" ? hVal : this.items.length + b.height + p.height;
    }
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;
    super.render(buffer);

    const rect = this.getContentRect();
    if (rect.width < 1 || rect.height < 1) return;

    const bg = this.findResolvedBackground();
    const glyphW = this.glyphWidth;
    const labelCol = this.labelColumnWidth;
    const detailX = rect.x + glyphW + 1 + labelCol + this.gap;
    const detailColor =
      App.instance?.cssResolver.resolveVariable(this, "$dimmed") || "bright-black";
    const labelColor = this.computedStyle.color || undefined;

    const rows = Math.min(this.items.length, rect.height);
    for (let i = 0; i < rows; i++) {
      const item = this.items[i];
      const y = rect.y + i;
      const stateColor = resolveStateColor(this, item.state);

      buffer.drawSegment(
        rect.x,
        y,
        new Segment(
          statusGlyph(item.state, this.glyphSet),
          this.cachedStyle({ color: stateColor, background: bg, bold: true }),
        ),
        rect,
      );
      buffer.drawSegment(
        rect.x + glyphW + 1,
        y,
        new Segment(
          item.label,
          this.cachedStyle({ color: labelColor || stateColor, background: bg }),
        ),
        rect,
      );
      if (item.detail) {
        buffer.drawSegment(
          detailX,
          y,
          new Segment(
            item.detail,
            this.cachedStyle({ color: detailColor, background: bg, dim: true }),
          ),
          rect,
        );
      }
    }
  }
}
