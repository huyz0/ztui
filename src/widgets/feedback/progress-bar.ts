import { requestAnimationTick } from "../../anim/animation.ts";
import type { Easing } from "../../anim/easing.ts";
import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import { parseDimension } from "../../layout/layout.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { BLACK, mix, parseRgb, type RGB, rgbStr } from "../../render/color.ts";
import { Segment } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";

/** Every cell is a solid full block; progress is shown through colour alone. */
const BLOCK = "█";

/** How dark the empty track is relative to the fill colour (0 = black). */
const TRACK_DIM = 0.22;

const FALLBACK_RGB: RGB = { r: 0, g: 255, b: 255 };

export class ProgressBarWidget extends Widget {
  public value = 0;
  public min = 0;
  public max = 100;
  /** When true, render `100%` after the bar. Off by default to stay compact. */
  public showPercent = false;
  /** Render an indeterminate sweep instead of a value-driven fill. */
  public indeterminate = false;
  /**
   * When > 0, tween the fill toward `value` over this many milliseconds instead
   * of snapping. Driven by the widget's own animation engine, so the motion
   * happens regardless of which framework (or none) set `value`. 0 = snap.
   */
  public animateMs = 0;
  /** Easing curve for the {@link animateMs} tween. Defaults to `out-cubic`. */
  public animateEasing: Easing = "out-cubic";

  constructor() {
    super("progress-bar");
    this.defaultStyle = { height: 1 };
  }

  public override measure(maxW: number, maxH: number): void {
    const b = this.borderSize;
    const p = this.padding;

    // A compact default: 20 cells of track, plus room for " 100%" if shown.
    const intrinsic = 20 + (this.showPercent ? 5 : 0);
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

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
    const contentRect = this.getContentRect();
    if (contentRect.width <= 0) return;

    const bg = this.findResolvedBackground();
    const primaryColor =
      this.computedStyle.color ||
      App.instance?.cssResolver.resolveVariable(this, "$primary") ||
      "cyan";

    // The bar is one solid band whose cells run from a dark shade of the fill
    // colour (empty) to the full fill colour (complete); the boundary cell takes
    // an in-between shade for sub-cell progress. No partial glyphs, so every
    // cell has the same weight and height.
    const fillRgb = parseRgb(primaryColor) ?? FALLBACK_RGB;
    const trackRgb = mix(BLACK, fillRgb, TRACK_DIM);

    // Reserve trailing " 100%" when requested; never let it eat the whole row.
    const pctWidth = this.showPercent ? 5 : 0;
    const trackWidth = Math.max(1, contentRect.width - pctWidth);
    const y = contentRect.y;

    // The value actually painted: tweened toward `value` when animation is on
    // (the widget books its own frames), or `value` verbatim when snapping.
    const shown =
      this.animateMs > 0 && !this.indeterminate
        ? this.animate("value", this.value, {
            duration: this.animateMs,
            easing: this.animateEasing,
          })
        : this.value;

    if (this.indeterminate) {
      this.renderIndeterminate(buffer, contentRect.x, y, trackWidth, fillRgb, trackRgb, bg);
    } else {
      this.renderDeterminate(buffer, contentRect.x, y, trackWidth, fillRgb, trackRgb, bg, shown);
    }

    if (this.showPercent) {
      const range = this.max - this.min;
      const pct = range === 0 ? 0 : (shown - this.min) / range;
      const clamped = Math.max(0, Math.min(1, pct));
      const text = `${String(Math.round(clamped * 100)).padStart(4)}%`;
      buffer.drawSegment(
        contentRect.x + trackWidth,
        y,
        new Segment(text, new Style({ color: primaryColor, background: bg })),
        contentRect,
      );
    }
  }

  private renderDeterminate(
    buffer: ScreenBuffer,
    x: number,
    y: number,
    trackWidth: number,
    fillRgb: RGB,
    trackRgb: RGB,
    bg: string,
    shown: number,
  ): void {
    const range = this.max - this.min;
    const pct = range === 0 ? 0 : (shown - this.min) / range;
    const clamped = Math.max(0, Math.min(1, pct));

    const fillExact = clamped * trackWidth;
    const fullCells = Math.floor(fillExact);
    const fraction = fillExact - fullCells; // sub-cell fill of the boundary cell

    for (let i = 0; i < trackWidth; i++) {
      let color: RGB;
      if (i < fullCells) {
        color = fillRgb;
      } else if (i === fullCells && fraction > 0) {
        color = mix(trackRgb, fillRgb, fraction);
      } else {
        color = trackRgb;
      }
      buffer.setCell(x + i, y, BLOCK, new Style({ color: rgbStr(color), background: bg }));
    }
  }

  private renderIndeterminate(
    buffer: ScreenBuffer,
    x: number,
    y: number,
    trackWidth: number,
    fillRgb: RGB,
    trackRgb: RGB,
    bg: string,
  ): void {
    // A bright crest sweeps back and forth, fading into the dark track at its
    // edges. Driven by the render clock so it animates without the caller
    // mutating `value`.
    const span = Math.max(1, trackWidth - 1);
    const t = (Date.now() / 60) % (span * 2);
    const head = t <= span ? t : span * 2 - t;
    const falloff = Math.max(2, trackWidth / 5);

    for (let i = 0; i < trackWidth; i++) {
      const dist = Math.abs(i - head);
      const intensity = Math.max(0, 1 - dist / falloff);
      const color = mix(trackRgb, fillRgb, intensity);
      buffer.setCell(x + i, y, BLOCK, new Style({ color: rgbStr(color), background: bg }));
    }
    requestAnimationTick(this, 33);
  }
}
