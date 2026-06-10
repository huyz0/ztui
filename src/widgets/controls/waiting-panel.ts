import { requestAnimationTick } from "../../core/animation.ts";
import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import { parseDimension } from "../../layout/layout.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { BLACK, mix, parseRgb, type RGB, rgbStr } from "../../render/color.ts";
import { Style } from "../../render/style.ts";

/**
 * A free-size waiting animation that fills its whole content area, for
 * panels large enough that the fixed 2×2/3×3 `WaitingGrid` would look lost.
 * Like the other indicators it animates through colour on solid blocks and
 * drives itself from the render clock.
 *
 * `variant` picks the motion:
 * - `ripple` — concentric brightness rings expand from the centre and fade.
 * - `orbit` — dots circle the centre at different radii and speeds, atom-like.
 * - `rain` — falling glyph streams, movie-style: letters and digits with a
 *   near-white head, a fading trail, and per-cell mutation.
 */
const BLOCK = "█";

/** Matrix-rain glyph pool: ASCII letters and digits, indexed by a per-cell hash. */
const RAIN_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** How often a trail glyph mutates into a different one, in ms. */
const RAIN_MUTATE_MS = 150;

const WHITE: RGB = { r: 255, g: 255, b: 255 };

const FALLBACK_RGB: RGB = { r: 0, g: 255, b: 255 };

/** Cells never go fully black, so the panel area stays visible. */
const FLOOR = 0.08;

/** Terminal cells are ~2× taller than wide; scale rows so circles look round. */
const CELL_ASPECT = 2;

export type WaitingPanelVariant = "ripple" | "orbit" | "rain";

/** Radii (fraction of panel) and relative speeds of the orbiting dots. */
const ORBITERS = [
  { radius: 0.85, speed: 1, phase: 0 },
  { radius: 0.55, speed: -1.6, phase: 0.4 },
  { radius: 0.3, speed: 2.3, phase: 0.8 },
];

/** Deterministic per-column hash so rain columns differ but stay stable. */
function columnHash(col: number): number {
  let h = (col + 1) * 2654435761;
  h ^= h >>> 13;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 16;
  return (h >>> 0) / 0xffffffff;
}

export class WaitingPanelWidget extends Widget {
  /** Motion style: expanding ripple, orbiting dots, or matrix rain. */
  public variant: WaitingPanelVariant = "ripple";
  /** Milliseconds for one full animation cycle. */
  public period = 1400;

  constructor() {
    super("waiting-panel");
    this.defaultStyle = {};
  }

  public override measure(maxW: number, maxH: number): void {
    const b = this.borderSize;
    const p = this.padding;

    // A sensible standalone footprint; panels usually pass explicit sizes.
    const intrinsicW = 12;
    const intrinsicH = 6;

    if (this.computedStyle.width === undefined) {
      this.measuredWidth = intrinsicW + b.width + p.width;
    } else {
      const wVal = parseDimension(this.computedStyle.width, maxW, -1);
      this.measuredWidth = typeof wVal === "number" ? wVal : intrinsicW + b.width + p.width;
    }

    if (this.computedStyle.height === undefined) {
      this.measuredHeight = intrinsicH + b.height + p.height;
    } else {
      const hVal = parseDimension(this.computedStyle.height, maxH, -1);
      this.measuredHeight = typeof hVal === "number" ? hVal : intrinsicH + b.height + p.height;
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

    // Animation phase, one full cycle per `period`.
    const phase = (Date.now() % this.period) / this.period;

    const isRain = this.variant === "rain";

    for (let row = 0; row < rect.height; row++) {
      for (let col = 0; col < rect.width; col++) {
        const lit = Math.max(
          0,
          Math.min(1, this.intensityAt(col, row, rect.width, rect.height, phase)),
        );

        let char: string;
        let color: string;
        if (isRain) {
          // Movie-style: glyphs only where a stream is passing, the head is
          // near-white, and trail glyphs mutate every few frames.
          if (lit <= 0) {
            char = " ";
            color = bg;
          } else {
            char = this.rainGlyphAt(col, row);
            const rgb =
              lit > 0.92
                ? mix(fillRgb, WHITE, 0.75) // bright head
                : mix(BLACK, fillRgb, FLOOR + (1 - FLOOR) * lit);
            color = rgbStr(rgb);
          }
        } else {
          const t = FLOOR + (1 - FLOOR) * lit;
          char = BLOCK;
          color = rgbStr(mix(BLACK, fillRgb, t));
        }

        const x = rect.x + col;
        const y = rect.y + row;
        if (y < 0 || y >= buffer.height || x < 0 || x >= buffer.width) continue;
        buffer.setCell(x, y, char, new Style({ color, background: bg }));
      }
    }

    requestAnimationTick(this, 33);
  }

  /**
   * The rain glyph for (col, row) right now. Deterministic in cell + time
   * bucket, so glyphs hold steady between frames but mutate every
   * {@link RAIN_MUTATE_MS} — like the movie's flickering streams.
   */
  private rainGlyphAt(col: number, row: number): string {
    // Cells mutate out of step: each has its own cadence (1–4 buckets) and a
    // fractional offset shifting its bucket boundary, so only a scattering of
    // glyphs change in any given frame.
    const cadence = 1 + Math.floor(columnHash(col * 31 + row * 131) * 4);
    const offset = columnHash(col * 7 + row * 977);
    const bucket = Math.floor(Date.now() / (RAIN_MUTATE_MS * cadence) + offset);
    const seed = columnHash((col + 1) * 8093 + (row + 1) * 569 + bucket * 31);
    return RAIN_GLYPHS[Math.floor(seed * RAIN_GLYPHS.length)];
  }

  /** Brightness 0..1 of the cell at (col, row) for the current `phase`. */
  private intensityAt(col: number, row: number, w: number, h: number, phase: number): number {
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    // Aspect-corrected offsets so radial motion looks circular on screen.
    const dx = col - cx;
    const dy = (row - cy) * CELL_ASPECT;

    switch (this.variant) {
      case "orbit": {
        // Each orbiter is a continuous bright spot; a cell lights by its
        // proximity to the nearest one, with a soft falloff.
        const maxR = Math.max(1, Math.min(cx, cy * CELL_ASPECT));
        let best = 0;
        for (const o of ORBITERS) {
          const a = (phase * o.speed + o.phase) * Math.PI * 2;
          const ox = Math.cos(a) * o.radius * maxR;
          const oy = Math.sin(a) * o.radius * maxR;
          const dist = Math.hypot(dx - ox, dy - oy);
          best = Math.max(best, 1 - dist / 2.2);
        }
        // Faint nucleus at the centre.
        const nucleus = Math.max(0, 0.45 - Math.hypot(dx, dy) / 3);
        return Math.max(best, nucleus);
      }
      case "rain": {
        // Each column drops a bright head at its own speed/offset; the trail
        // above the head fades out over a few rows.
        const r1 = columnHash(col);
        const r2 = columnHash(col * 7919);
        const tail = 3 + Math.floor(r2 * 3);
        const span = h + tail;
        const headRow = ((phase * (0.6 + r1) + r2) % 1) * span - tail;
        const above = headRow - row; // >0 once the head has passed this cell
        if (above < 0) return 0;
        return Math.max(0, 1 - above / tail);
      }
      default: {
        // ripple: a ring expands from the centre to the far corner and fades
        // as it grows; a new ring starts each cycle.
        const maxDist = Math.hypot(cx, cy * CELL_ASPECT) || 1;
        const dist = Math.hypot(dx, dy);
        const ringR = phase * maxDist;
        const ring = Math.max(0, 1 - Math.abs(dist - ringR) / 1.8);
        return ring * (1 - phase * 0.6); // fade out as it expands
      }
    }
  }
}
