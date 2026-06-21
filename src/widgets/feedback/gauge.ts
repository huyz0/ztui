import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import { parseDimension } from "../../layout/layout.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";

/** Horizontal eighth-blocks (1/8 → 8/8) for sub-cell fill precision. */
const HBARS = ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"] as const;

/** A coloured severity band: the fill takes this colour at/after `at` (value units). */
export interface GaugeThreshold {
  /** Lower bound of the band, in value units. */
  at: number;
  /** Band colour (theme `$var` or literal). */
  color: string;
}

function resolveColor(widget: Widget, color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  if (color.startsWith("$")) {
    return (widget.app ?? App.instance)?.cssResolver.resolveVariable(widget, color) || fallback;
  }
  return color;
}

/** Compact number for the readout: integers as-is, else one decimal. */
function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * A single-value meter — a labelled horizontal bar whose fill is coloured by
 * severity {@link thresholds} (e.g. green → amber → red) with a value readout.
 * For utilization/quota/score signals (CPU, disk, memory, rate limits) where
 * the *level* carries meaning, unlike a plain {@link ProgressBarWidget} which
 * only shows progress in one colour.
 *
 * Each track cell maps to a slice of the range and takes the colour of the band
 * it falls in, so the filled portion reads as coloured zones; cells past the
 * value are a dim track. Sub-cell precision via eighth-blocks.
 *
 * Space-constrained by design: it sheds the value readout, then the label, to
 * keep at least a one-cell bar, and never draws outside its content box.
 *
 * ```tsx
 * <Gauge label="CPU" value={82} unit="%"
 *   thresholds={[{ at: 0, color: "$success" }, { at: 70, color: "$warning" }, { at: 90, color: "$error" }]} />
 * ```
 */
export class GaugeWidget extends Widget {
  /** Current value. */
  public value = 0;
  /** Scale floor (0% point). Default 0. */
  public min = 0;
  /** Scale ceiling (100% point). Default 100. */
  public max = 100;
  /** Optional label shown before the bar. */
  public label: string | undefined = undefined;
  /** Unit for the readout (e.g. `%`, `MB`); when unset the readout is a percentage. */
  public unit?: string;
  /** Print the value readout after the bar. Default true. */
  public showValue = true;
  /** Severity bands; the fill colours by the band each cell falls in. */
  public thresholds?: GaugeThreshold[];
  /** Base fill colour when no threshold applies (theme `$var` or literal). Default `$accent`. */
  public color?: string;

  constructor() {
    super("gauge");
    this.defaultStyle = { height: 1 };
  }

  /** The fraction [0,1] of `value` within [min,max]. */
  private get fraction(): number {
    const range = this.max - this.min;
    if (range <= 0) return 0;
    return Math.max(0, Math.min(1, (this.value - this.min) / range));
  }

  /** The readout text: `${value}${unit}`, or a percentage when no unit is set. */
  private get readout(): string {
    if (this.unit !== undefined) return `${fmtNum(this.value)}${this.unit}`;
    return `${Math.round(this.fraction * 100)}%`;
  }

  public override measure(maxW: number, maxH: number): void {
    const b = this.borderSize;
    const p = this.padding;

    const labelW = this.label ? stringWidth(this.label) + 1 : 0;
    const valueW = this.showValue ? stringWidth(this.readout) + 1 : 0;
    const intrinsic = labelW + 20 + valueW;

    if (this.computedStyle.width === undefined) {
      this.measuredWidth = intrinsic + b.width + p.width;
    } else {
      const wVal = parseDimension(this.computedStyle.width, maxW, -1);
      this.measuredWidth = typeof wVal === "number" ? wVal : intrinsic + b.width + p.width;
    }

    if (this.computedStyle.height === undefined) {
      this.measuredHeight = 1 + b.height + p.height;
    } else {
      const hVal = parseDimension(this.computedStyle.height, maxH, -1);
      this.measuredHeight = typeof hVal === "number" ? hVal : 1 + b.height + p.height;
    }
  }

  /** Colour for the band containing value `v`: the highest threshold `at` ≤ v, else the base. */
  private bandColor(v: number, base: string): string {
    if (!this.thresholds || this.thresholds.length === 0) return base;
    let color = base;
    let best = Number.NEGATIVE_INFINITY;
    for (const t of this.thresholds) {
      if (v >= t.at && t.at >= best) {
        best = t.at;
        color = resolveColor(this, t.color, base);
      }
    }
    return color;
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;
    super.render(buffer);

    const rect = this.getContentRect();
    if (rect.width < 1 || rect.height < 1) return;

    const bg = this.findResolvedBackground();
    const base = resolveColor(this, this.color, resolveColor(this, "$accent", "#4daafc"));
    const labelColor = resolveColor(this, "$dimmed", "bright-black");
    const trackColor = labelColor;
    const y = rect.y;

    // Allocate columns: label | bar | value. Shed the value first, then the
    // label, so at least a one-cell bar always survives a tight width.
    let labelW = this.label ? Math.min(stringWidth(this.label), rect.width - 2) : 0;
    let valueW = this.showValue ? stringWidth(this.readout) : 0;
    const need = () => (labelW ? labelW + 1 : 0) + (valueW ? valueW + 1 : 0);
    let barW = rect.width - need();
    while (barW < 1 && (valueW > 0 || labelW > 0)) {
      if (valueW > 0) valueW = 0;
      else labelW = 0;
      barW = rect.width - need();
    }
    if (barW < 1) return;

    let x = rect.x;
    if (labelW > 0) {
      const label = this.label?.slice(0, labelW) ?? "";
      buffer.drawSegment(
        x,
        y,
        new Segment(label, this.cachedStyle({ color: labelColor, background: bg })),
        rect,
      );
      x += labelW + 1;
    }

    const range = this.max - this.min;
    const eighths = Math.round(this.fraction * barW * 8);
    const full = Math.floor(eighths / 8);
    const partial = eighths % 8;

    for (let c = 0; c < barW; c++) {
      // The value this cell represents (its right edge), for band colouring.
      const cellValue = this.min + ((c + 1) / barW) * range;
      if (c < full) {
        buffer.setCell(
          x + c,
          y,
          "█",
          new Style({ color: this.bandColor(cellValue, base), background: bg }),
        );
      } else if (c === full && partial > 0) {
        buffer.setCell(
          x + c,
          y,
          HBARS[partial - 1],
          new Style({ color: this.bandColor(this.value, base), background: bg }),
        );
      } else {
        buffer.setCell(x + c, y, "░", this.cachedStyle({ color: trackColor, background: bg }));
      }
    }

    if (valueW > 0) {
      buffer.drawSegment(
        x + barW + 1,
        y,
        new Segment(
          this.readout,
          this.cachedStyle({ color: this.computedStyle.color || base, background: bg }),
        ),
        rect,
      );
    }
  }
}
