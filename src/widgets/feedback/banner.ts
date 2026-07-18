import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import type { MouseEvent } from "../../driver/driver.ts";
import { parseDimension } from "../../layout/layout.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { mix, parseRgb, rgbStr } from "../../render/color.ts";
import { charWidth, Segment } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { truncate, wrapText } from "../../render/text-wrap.ts";

/**
 * Semantic tone of a {@link BannerWidget}. Each variant drives the icon and the
 * accent colour together, resolved from a theme variable so a host theme
 * recolours every banner at once.
 */
export type BannerVariant = "info" | "success" | "warning" | "error" | "neutral";

/** Which glyph vocabulary to draw the leading icon with. */
export type BannerGlyphSet = "unicode" | "ascii" | "emoji";

const ICONS: Record<BannerGlyphSet, Record<BannerVariant, string>> = {
  // "✓" (U+2713), not the emoji-codepoint "✔" (U+2714) — see status.ts's
  // completed-glyph comment for why.
  unicode: { info: "ⓘ", success: "✓", warning: "▲", error: "✘", neutral: "•" },
  ascii: { info: "i", success: "v", warning: "!", error: "x", neutral: "-" },
  emoji: { info: "ℹ️", success: "✅", warning: "⚠️", error: "❌", neutral: "▪️" },
};

/** Each variant's accent: a theme variable first, then a literal fallback. */
const VARIANT_COLOR: Record<BannerVariant, { variable: string; fallback: string }> = {
  info: { variable: "$primary", fallback: "#4daafc" },
  success: { variable: "$success", fallback: "#4ec07a" },
  warning: { variable: "$warning", fallback: "#e5c07b" },
  error: { variable: "$error", fallback: "#e06c75" },
  neutral: { variable: "$dimmed", fallback: "bright-black" },
};

/**
 * A persistent inline callout — an accent rule, an icon, an optional bold title
 * and a word-wrapped message — for surfacing a state the user should notice but
 * that does not steal focus or auto-dismiss like a toast. Five semantic
 * variants (`info`/`success`/`warning`/`error`/`neutral`) drive the icon and a
 * theme-resolved accent together.
 *
 * It stretches to its container width by default and computes its own height
 * from the wrapped message, so it drops naturally into a column. When
 * {@link dismissible} is set it draws a `×` affordance at the top-right and
 * fires {@link onDismiss} when it is clicked.
 *
 * Space-constrained by design: it wraps the message to whatever width it is
 * given, truncates the title, and never draws outside its content box.
 *
 * ```tsx
 * <Banner variant="warning" title="Unsaved changes" message="Your edits will be lost." />
 * ```
 */
export class BannerWidget extends Widget {
  /** Semantic tone — sets the icon and accent colour. */
  public variant: BannerVariant = "info";
  /** Optional bold heading shown on the first line. */
  public title?: string;
  /** Body text; word-wrapped to the available width. */
  public message = "";
  /** Icon vocabulary. `emoji` is two cells wide. */
  public glyphSet: BannerGlyphSet = "unicode";
  /** Draw the leading variant icon. Default true. */
  public showIcon = true;
  /** Tint the background toward the accent. Default true. */
  public fill = true;
  /** Draw a clickable `×` at the top-right that fires {@link onDismiss}. */
  public dismissible = false;
  /** Called when the `×` is clicked (only when {@link dismissible}). */
  public declare onDismiss?: () => void;

  /** Absolute screen cell of the `×` affordance, for click hit-testing (-1 when absent). */
  private dismissX = -1;
  private dismissY = -1;

  constructor() {
    super("banner");
    this.defaultStyle = { width: "100%" };
    this.hoverInterest = true; // so the × can show a pointer/hover affordance
  }

  private get icon(): string {
    return ICONS[this.glyphSet][this.variant];
  }

  /** Columns reserved on the left for the accent rule + icon, before the text. */
  private get leftCols(): number {
    // rule (1) + gap (1) [+ icon + gap]
    return 2 + (this.showIcon ? charWidth(this.icon) + 1 : 0);
  }

  /** Lay out the title + wrapped message into a content box `contentW` wide. */
  private layout(contentW: number): { title?: string; lines: string[] } {
    const textW = Math.max(0, contentW - this.leftCols - (this.dismissible ? 2 : 0));
    const title = this.title ? truncate(this.title, textW) : undefined;
    const lines = this.message ? wrapText(this.message, textW) : [];
    return { title, lines };
  }

  public override measure(maxW: number, maxH: number): void {
    const b = this.borderSize;
    const p = this.padding;

    const wStyle = this.computedStyle.width;
    const w = wStyle === undefined ? maxW : parseDimension(wStyle, maxW, -1);
    const contentW = typeof w === "number" ? w : maxW;
    this.measuredWidth = contentW + b.width + p.width;

    const hStyle = this.computedStyle.height;
    if (hStyle === undefined) {
      const { title, lines } = this.layout(contentW);
      const rows = Math.max(1, (title ? 1 : 0) + lines.length);
      this.measuredHeight = rows + b.height + p.height;
    } else {
      const h = parseDimension(hStyle, maxH, -1);
      this.measuredHeight = (typeof h === "number" ? h : 1) + b.height + p.height;
    }
  }

  public override handleMouse(ev: MouseEvent): void {
    if (
      this.dismissible &&
      this.onDismiss &&
      ev.type === "press" &&
      ev.button === "left" &&
      ev.y === this.dismissY &&
      ev.x === this.dismissX
    ) {
      this.onDismiss();
      ev.handled = true;
      return;
    }
    super.handleMouse(ev);
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;
    super.render(buffer);

    const rect = this.getContentRect();
    this.dismissX = -1;
    this.dismissY = -1;
    if (rect.width < 1 || rect.height < 1) return;

    const resolver = (this.app ?? App.instance)?.cssResolver;
    const { variable, fallback } = VARIANT_COLOR[this.variant];
    const accent = resolver?.resolveVariable(this, variable) || fallback;
    const baseBg = this.findResolvedBackground();
    const fg =
      this.computedStyle.color || resolver?.resolveVariable(this, "$foreground") || "default";
    const dimmed = resolver?.resolveVariable(this, "$dimmed") || "bright-black";

    // Best-effort tinted fill: blend the accent into the surface. Only when both
    // colours parse to RGB; otherwise fall back to the plain background.
    let bg = baseBg;
    if (this.fill) {
      const accRgb = parseRgb(accent);
      const bgRgb = parseRgb(baseBg);
      if (accRgb && bgRgb) bg = rgbStr(mix(bgRgb, accRgb, 0.14));
    }

    const cellBg = new Style({ background: bg });
    // Fill the content box with the tint so wrapped lines share one panel.
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        buffer.setCell(x, y, " ", cellBg);
      }
    }

    // Accent rule down the left edge.
    const ruleStyle = new Style({ color: accent, background: bg });
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      buffer.setCell(rect.x, y, "▌", ruleStyle);
    }

    const { title, lines } = this.layout(rect.width);
    const textX = rect.x + this.leftCols;

    // Icon on the first row, in the accent colour.
    if (this.showIcon) {
      buffer.drawSegment(
        rect.x + 2,
        rect.y,
        new Segment(this.icon, new Style({ color: accent, background: bg, bold: true })),
        rect,
      );
    }

    let row = 0;
    if (title !== undefined) {
      buffer.drawSegment(
        textX,
        rect.y,
        new Segment(title, new Style({ color: accent, background: bg, bold: true })),
        rect,
      );
      row = 1;
    }
    for (const line of lines) {
      if (rect.y + row >= rect.y + rect.height) break;
      buffer.drawSegment(
        textX,
        rect.y + row,
        new Segment(line, new Style({ color: fg, background: bg })),
        rect,
      );
      row++;
    }

    // Dismiss affordance at the top-right.
    if (this.dismissible) {
      const dx = rect.x + rect.width - 1;
      buffer.setCell(dx, rect.y, "×", new Style({ color: dimmed, background: bg }));
      this.dismissX = dx;
      this.dismissY = rect.y;
    }
  }
}
