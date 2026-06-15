import { requestAnimationTick } from "../../anim/animation.ts";
import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import { parseDimension } from "../../layout/layout.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { BLACK, mix, parseRgb, type RGB, rgbStr } from "../../render/color.ts";
import { Style } from "../../render/style.ts";

/**
 * A larger waiting indicator: a square block of cells animated by colour
 * alone. Sized for screen- or panel-level "please wait" states rather than
 * inline use.
 *
 * `cells` picks the layout: 4 → a 2×2 grid, 9 → a 3×3 grid. The default
 * footprint is one terminal cell per dot, so a 3×3 grid is 3 columns wide.
 *
 * `variant` picks the motion:
 * - `ring` — a brightness crest chases around the ring (a rotating loader).
 * - `radar` — a beam sweeps from the centre, leaving a decaying afterglow.
 * - `shimmer` — a diagonal bright band slides across, skeleton-loader style.
 */
const BLOCK = "█";

const FALLBACK_RGB: RGB = { r: 0, g: 255, b: 255 };

/** Empty dots never go fully black, so the grid's shape stays legible. */
const FLOOR = 0.12;

/** Fraction of the ring lit by the travelling crest. */
const CREST = 0.4;

/** Width of the shimmer band as a fraction of the diagonal. */
const BAND = 0.35;

/** Grid size: 4 (2x2) or 9 (3x3) cells. */
export type WaitingGridCells = 4 | 9;
/** Animation style for a {@link WaitingGridWidget}. */
export type WaitingGridVariant = "ring" | "radar" | "shimmer";

export class WaitingGridWidget extends Widget {
  /** Total dots: 4 (2×2) or 9 (3×3). */
  public cells: WaitingGridCells = 9;
  /** Milliseconds for one full animation cycle. */
  public period = 1500;
  /** Motion style: rotating crest, radar sweep, or diagonal shimmer. */
  public variant: WaitingGridVariant = "ring";

  constructor() {
    super("waiting-grid");
    this.defaultStyle = {};
  }

  private get side(): number {
    return this.cells === 4 ? 2 : 3;
  }

  public override measure(maxW: number, maxH: number): void {
    const b = this.borderSize;
    const p = this.padding;
    const side = this.side;

    if (this.computedStyle.width === undefined) {
      this.measuredWidth = side + b.width + p.width;
    } else {
      const wVal = parseDimension(this.computedStyle.width, maxW, -1);
      this.measuredWidth = typeof wVal === "number" ? wVal : side + b.width + p.width;
    }

    if (this.computedStyle.height === undefined) {
      this.measuredHeight = side + b.height + p.height;
    } else {
      const hVal = parseDimension(this.computedStyle.height, maxH, -1);
      this.measuredHeight = typeof hVal === "number" ? hVal : side + b.height + p.height;
    }
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;
    super.render(buffer);

    const rect = this.getContentRect();
    if (rect.width < 1 || rect.height < 1) return;

    const bg = this.findResolvedBackground();
    const fillColor =
      this.computedStyle.color ||
      App.instance?.cssResolver.resolveVariable(this, "$primary") ||
      "cyan";
    const fillRgb = parseRgb(fillColor) ?? FALLBACK_RGB;

    const side = this.side;
    const center = (side - 1) / 2;

    // The crest's current position on the ring, expressed as a turn fraction.
    const head = (Date.now() % this.period) / this.period;

    const cols = Math.min(side, rect.width);
    const rows = Math.min(side, rect.height);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const lit = this.intensityAt(col, row, center, side, head);
        const t = FLOOR + (1 - FLOOR) * lit;
        const color = rgbStr(mix(BLACK, fillRgb, t));

        const x = rect.x + col;
        const y = rect.y + row;
        if (y < 0 || y >= buffer.height || x < 0 || x >= buffer.width) continue;
        buffer.setCell(x, y, BLOCK, new Style({ color, background: bg }));
      }
    }

    // ~20fps for a slow colour crest; the period stays time-accurate.
    requestAnimationTick(this, 50, true); // paint-only colour animation
  }

  /** Brightness 0..1 of the dot at (col, row) for the current phase `head`. */
  private intensityAt(
    col: number,
    row: number,
    center: number,
    side: number,
    head: number,
  ): number {
    // The dot's angle around the centre, mapped to a 0..1 turn. The exact
    // centre of an odd grid has no angle; treat it per-variant below.
    const isCenter = col === center && row === center;
    const angle = Math.atan2(row - center, col - center); // -PI..PI
    const turn = (angle / (Math.PI * 2) + 1) % 1;

    switch (this.variant) {
      case "radar": {
        // The beam is brightest where it points now, fading linearly behind
        // it around the full turn — a decaying afterglow trail. The centre
        // pivot stays half lit.
        if (isCenter) return 0.5;
        const behind = (head - turn + 1) % 1; // how long ago the beam passed
        return 1 - behind;
      }
      case "shimmer": {
        // A bright band slides along the ↘ diagonal and wraps around.
        const span = Math.max(1, 2 * (side - 1));
        const pos = (col + row) / span; // 0..1 across the diagonal
        let d = Math.abs(pos - head);
        if (d > 0.5) d = 1 - d;
        return Math.max(0, 1 - d / BAND);
      }
      default: {
        // ring: shortest distance around the ring to the crest, 0..0.5.
        if (isCenter) return 0;
        let d = Math.abs(turn - head);
        if (d > 0.5) d = 1 - d;
        return Math.max(0, 1 - d / CREST);
      }
    }
  }
}
