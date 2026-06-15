import { requestAnimationTick } from "../../anim/animation.ts";
import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { BLACK, mix, parseRgb, type RGB, rgbStr } from "../../render/color.ts";
import { Style } from "../../render/style.ts";

/**
 * A waiting indicator confined to a single cell. The visible glyph is chosen
 * from a frame set driven by the render clock, so it animates on its own
 * without the caller mutating any prop.
 *
 * - `rotate` cycles a braille spinner — the canonical "working" twirl.
 * - `bounce` grows and shrinks a vertical bar, like a dot hopping in place.
 * - `blink` fades a single dot in and out via colour alone (the glyph is
 *   fixed, so it never shifts the baseline).
 * - `hex` flips a hexagon between its outline and filled forms.
 * - `quadrant` orbits a small block around the cell's four corners.
 * - `arc` races an arc segment around a circle outline.
 */
export type SpinnerMode = "rotate" | "bounce" | "blink" | "hex" | "quadrant" | "arc";

const FALLBACK_RGB: RGB = { r: 0, g: 255, b: 255 };

/** How dark the trough of a `blink` cycle gets (0 = black). */
const BLINK_FLOOR = 0.15;

const FRAMES: Record<SpinnerMode, string[]> = {
  rotate: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  bounce: ["▁", "▃", "▄", "▆", "▇", "█", "▇", "▆", "▄", "▃"],
  // A fixed glyph; `blink` animates brightness, not the character.
  blink: ["●"],
  hex: ["⬡", "⬢"],
  quadrant: ["▖", "▘", "▝", "▗"],
  arc: ["◜", "◠", "◝", "◞", "◡", "◟"],
};

/**
 * Per-mode scaling of `interval`. A two-frame flip at the rotate cadence would
 * strobe, so `hex` holds each form several beats longer.
 */
const INTERVAL_SCALE: Record<SpinnerMode, number> = {
  rotate: 1,
  bounce: 1,
  blink: 1,
  hex: 5,
  // Four frames per orbit reads frantic at the rotate cadence; slow it down.
  quadrant: 2,
  arc: 1,
};

export class SpinnerWidget extends Widget {
  /** Animation style. */
  public mode: SpinnerMode = "rotate";
  /** Milliseconds each frame (or, for `blink`, each pulse step) is shown. */
  public interval = 80;
  /** Override the built-in frame set; takes priority over `mode` glyphs. */
  public frames: string[] | undefined = undefined;

  constructor() {
    super("spinner");
    this.defaultStyle = { width: 1, height: 1 };
  }

  private get activeFrames(): string[] {
    if (this.frames && this.frames.length > 0) return this.frames;
    return FRAMES[this.mode] ?? FRAMES.rotate;
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;
    super.render(buffer);

    const rect = this.getContentRect();
    if (rect.width < 1 || rect.height < 1) return;
    if (rect.y < 0 || rect.y >= buffer.height || rect.x < 0 || rect.x >= buffer.width) return;

    const bg = this.findResolvedBackground();
    const baseColor =
      this.computedStyle.color ||
      App.instance?.cssResolver.resolveVariable(this, "$primary") ||
      "cyan";

    const frames = this.activeFrames;
    // Custom frames always run at the raw interval; built-in modes apply
    // their own pacing (e.g. hex holds each form longer).
    const scale = this.frames ? 1 : (INTERVAL_SCALE[this.mode] ?? 1);
    const frameMs = Math.max(16, this.interval) * scale;
    const step = Math.floor(Date.now() / frameMs);

    let char: string;
    let color = baseColor;

    if (this.mode === "blink" && !this.frames) {
      // Hold the glyph steady and breathe its brightness on a sine curve. A
      // single frame would strobe at the frame rate, so the pulse spans a
      // calmer multiple of `interval` (≈0.8s at the default).
      char = FRAMES.blink[0];
      const rgb = parseRgb(baseColor) ?? FALLBACK_RGB;
      const cycleMs = Math.max(16, this.interval) * 10;
      const phase = (Date.now() % cycleMs) / cycleMs;
      const wave = (Math.sin(phase * Math.PI * 2) + 1) / 2; // 0..1
      const t = BLINK_FLOOR + (1 - BLINK_FLOOR) * wave;
      color = rgbStr(mix(BLACK, rgb, t));
    } else {
      char = frames[step % frames.length];
    }

    buffer.setCell(
      rect.x,
      rect.y,
      char,
      new Style({
        color,
        background: bg,
        bold: this.computedStyle.bold,
      }),
    );

    // Paint-only: the spinner just cycles a glyph/colour in its fixed cell.
    requestAnimationTick(
      this,
      this.mode === "blink" && !this.frames ? this.interval : frameMs,
      true,
    );
  }
}
