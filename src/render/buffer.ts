import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import type { Cell } from "./cell.ts";
import { mix, parseColor, type RGB, rgbStr } from "./color.ts";
import { ScreenDiffCompiler } from "./screen-diff-compiler.ts";
import type { Segment } from "./segment.ts";
import { charWidth, isControlChar, splitGraphemes } from "./segment.ts";
import { Style } from "./style.ts";

// Cell-level types/helpers (the glyph+style+icon/graphic model) live in
// `cell.ts` — re-exported here so existing imports from `buffer.ts` keep
// working. They're in their own module (rather than `screen-diff-compiler.ts`
// importing them from here) so the grid model and the diff compiler don't
// import from each other.
export type { Cell, GraphicMetadata } from "./cell.ts";
export { graphicsEqual, needsGraphicClear } from "./cell.ts";

/** Concrete RGB to substitute when a cell's colour is `default`/unset. */
/** Concrete fallback colors a translucent blend composites against. */
export interface BlendBase {
  /** Background to blend toward. */
  bg: RGB;
  /** Foreground to blend toward. */
  fg: RGB;
}

// Shared ANSI diff/scroll-detection compiler used by `renderDiff`/`differsFrom`
// below. Its transient per-call state (see `ScreenDiffCompiler`) is reset at
// the start of every call, so one instance can safely serve every buffer pair.
const screenDiffCompiler = new ScreenDiffCompiler();

/**
 * The backend-neutral cell grid every widget paints into. A 2-D array of
 * {@link Cell} (char + {@link Style} + optional icon/graphic). Drivers turn it
 * into ANSI (terminal) or draw it (canvas). In a custom widget you mostly call
 * {@link setCell} inside your region.
 */
export class ScreenBuffer {
  /** The grid, indexed `cells[y][x]`. */
  public cells: Cell[][] = [];
  private clipStack: (Region | null)[] = [];
  /** Active clip rectangle; writes outside it are dropped (null = unclipped). */
  public currentClip: Region | null = null;
  /**
   * Set true by widgets that place an inline icon/graphic this frame. Terminal
   * graphics are a separate, stateful layer (Kitty/iTerm/Sixel) that only the
   * full-buffer diff clears/redraws correctly, so the app forces a full frame
   * (not a damage-scoped partial repaint) whenever this is set.
   */
  public containsGraphics = false;
  /**
   * Order-independent hash of the cells that hold an inline graphic this frame.
   * When it changes between full frames a graphic was added/moved/removed, so the
   * app wipes all terminal graphics and re-emits — clearing any placement that
   * was orphaned (scrolled, screen swapped) and that the per-cell diff alone
   * can't catch. Unchanged across frames → no wipe, so static graphics (and a
   * breathing focus ring over them) never flicker.
   */
  public graphicSignature = 0;

  /** Record an inline graphic at `(x, y)` for damage/orphan tracking. */
  public noteGraphic(x: number, y: number): void {
    this.containsGraphics = true;
    // Commutative accumulation so cell visit order doesn't matter.
    this.graphicSignature = (this.graphicSignature + (y * 9973 + x) * 31 + 1) | 0;
  }

  constructor(
    /** Width in cells. */
    public width = 0,
    /** Height in cells. */
    public height = 0,
  ) {
    this.resize(width, height);
  }

  /** Resize the grid, reallocating cells to blanks. */
  public resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.cells = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ({
        char: " ",
        style: Style.DEFAULT,
        wideContinuation: false,
        icon: undefined,
        graphic: undefined,
      })),
    );
  }

  /** Reset cells in rows `[yStart, yEnd)` to a blank space with default style (whole grid by default). */
  public clear(yStart = 0, yEnd = this.height): void {
    const y0 = Math.max(0, yStart);
    const y1 = Math.min(this.height, yEnd);
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.cells[y][x];
        cell.char = " ";
        cell.style = Style.DEFAULT;
        cell.wideContinuation = false;
        cell.icon = undefined;
        cell.graphic = undefined;
      }
    }
  }

  /** Push a clip rectangle (intersected with the current one); writes outside are ignored until {@link popClip}. */
  public pushClip(region: Region): void {
    this.clipStack.push(this.currentClip);
    if (this.currentClip) {
      const intersect = this.currentClip.intersection(region);
      this.currentClip = intersect || new Region(Offset.ORIGIN, Size.ZERO);
    } else {
      this.currentClip = region;
    }
  }

  /** Restore the clip rectangle saved by the matching {@link pushClip}. */
  public popClip(): void {
    if (this.clipStack.length > 0) {
      this.currentClip = this.clipStack.pop() || null;
    }
  }

  /**
   * If `row[x]` is currently one half of a wide (2-cell) glyph, blank the
   * *other* half so it doesn't survive as a stale orphan once `row[x]` itself
   * is overwritten below — a continuation cell without its main (or a main
   * cell without its continuation) would otherwise leave the buffer
   * self-inconsistent within the same frame (e.g. an overlay painting one
   * column of a wide glyph a widget drew underneath it).
   */
  private static clearWideOrphan(row: Cell[], x: number, width: number): void {
    const cell = row[x];
    if (cell.wideContinuation) {
      let mainX = x - 1;
      while (mainX >= 0 && row[mainX].wideContinuation) mainX--;
      if (mainX >= 0) {
        row[mainX].char = " ";
        row[mainX].wideContinuation = false;
      }
    } else if (charWidth(cell.char) === 2 && x + 1 < width) {
      const cont = row[x + 1];
      if (cont.wideContinuation) {
        cont.char = " ";
        cont.wideContinuation = false;
      }
    }
  }

  /** Write one styled character at `(x, y)`. Out-of-bounds and clipped writes are ignored; wide glyphs occupy two cells. */
  public setCell(x: number, y: number, char: string, style: Style): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return;
    }
    if (this.currentClip && !this.currentClip.contains(x, y)) {
      return;
    }
    // Guard against raw control characters reaching the terminal (cursor
    // corruption). They have zero width, so the next glyph overwrites this cell.
    const safeChar = isControlChar(char) ? " " : char;
    const w = charWidth(safeChar);

    // Mutate cells in place rather than replacing the object. A full frame calls
    // setCell once per painted cell; allocating a fresh cell each time churned
    // the GC every frame. `clear()` already resets in place, so this is
    // consistent — and the diff/copyTo paths read fields, never object identity.
    const row = this.cells[y];
    ScreenBuffer.clearWideOrphan(row, x, this.width);
    if (w === 2) {
      // A wide glyph occupies two columns. If the second column is off-buffer or
      // outside the active clip, drawing the glyph would spill past the boundary
      // onto a neighbouring widget — substitute a space instead.
      const continuationFits =
        x + 1 < this.width && (!this.currentClip || this.currentClip.contains(x + 1, y));
      if (!continuationFits) {
        const cell = row[x];
        cell.char = " ";
        cell.style = style;
        cell.wideContinuation = false;
        cell.icon = undefined;
        cell.graphic = undefined;
        return;
      }
      ScreenBuffer.clearWideOrphan(row, x + 1, this.width);
      const main = row[x];
      main.char = safeChar;
      main.style = style;
      main.wideContinuation = false;
      main.icon = undefined;
      main.graphic = undefined;
      const cont = row[x + 1];
      cont.char = "";
      cont.style = style;
      cont.wideContinuation = true;
      cont.icon = undefined;
      cont.graphic = undefined;
      return;
    }

    const cell = row[x];
    cell.char = safeChar;
    cell.style = style;
    cell.wideContinuation = false;
    cell.icon = undefined;
    cell.graphic = undefined;
  }

  /**
   * Alpha-composite a translucent colour over every cell in `region`, in place.
   * Each cell's existing background and foreground are blended `alpha` of the
   * way toward `src`, so the glyphs underneath stay visible but tinted — the
   * basis for modal scrims, drop shadows, and translucent panels. Cells whose
   * colour is `default`/unset blend against `base` (typically the theme bg/fg),
   * since the real terminal default is unknowable. Glyphs are untouched.
   */
  public blendRegion(region: Region, src: RGB, alpha: number, base: BlendBase): void {
    if (alpha <= 0) return;
    const a = Math.min(1, alpha);
    const y0 = Math.max(0, region.y);
    const y1 = Math.min(this.height, region.bottom);
    const x0 = Math.max(0, region.x);
    const x1 = Math.min(this.width, region.right);
    for (let y = y0; y < y1; y++) {
      const row = this.cells[y];
      if (!row) continue;
      for (let x = x0; x < x1; x++) {
        const cell = row[x];
        if (!cell || typeof cell.style?.merge !== "function") continue;
        if (this.currentClip && !this.currentClip.contains(x, y)) continue;
        const bg = cell.style.background
          ? (parseColor(cell.style.background)?.rgb ?? base.bg)
          : base.bg;
        const fg = cell.style.color ? (parseColor(cell.style.color)?.rgb ?? base.fg) : base.fg;
        cell.style = cell.style.merge({
          background: rgbStr(mix(bg, src, a)),
          color: rgbStr(mix(fg, src, a)),
        });
      }
    }
  }

  /** Draw a styled {@link Segment} starting at `(startX, startY)`, advancing per grapheme width. */
  public drawSegment(startX: number, startY: number, segment: Segment, clipRegion?: Region): void {
    if (startY < 0 || startY >= this.height) return;

    let x = startX;
    const y = startY;

    for (const char of splitGraphemes(segment.text)) {
      const w = charWidth(char);
      // Check clipping
      if (clipRegion) {
        if (!clipRegion.contains(x, y)) {
          x += w;
          continue;
        }
      }

      this.setCell(x, y, char, segment.style);
      x += w;
    }
  }

  /** Diff against `oldBuffer` and return the ANSI to update only the changed cells (terminal backend). */
  public renderDiff(
    oldBuffer: ScreenBuffer,
    formatChar?: (cell: Cell, oldCell?: Cell) => string,
    clipW?: number,
    clipH?: number,
    // First row to scan. With damage-tracked partial repaint, only the changed
    // band of rows is diffed; rows above `yStart` are known unchanged this frame.
    yStart = 0,
    // When set, try to express the frame as a terminal scroll of a row band so
    // shifted content is moved by the terminal instead of re-emitted. Only valid
    // for a full-frame diff on a scroll-region-capable terminal (the App gates it).
    allowScroll = false,
    // When set, collapse identical-char runs with REP (`\x1b[nb`); the App passes
    // the terminal's `repeatChar` capability so it is only used where supported.
    allowRepeat = false,
  ): string {
    return screenDiffCompiler.renderDiff(
      this,
      oldBuffer,
      formatChar,
      clipW,
      clipH,
      yStart,
      allowScroll,
      allowRepeat,
    );
  }

  /**
   * Whether any cell in rows `[yStart, yEnd)` differs from `old` — a cheap change
   * detector (early-exits, allocates nothing) for backends that re-present the
   * cell grid rather than consuming the ANSI diff. The encoding-free half of the
   * render path's change detection.
   */
  public differsFrom(old: ScreenBuffer, yStart = 0, yEnd = this.height): boolean {
    return screenDiffCompiler.differsFrom(this, old, yStart, yEnd);
  }

  /** Copy every cell field from row `from` to row `to` (in place, no realloc). */
  private copyRow(from: number, to: number): void {
    const src = this.cells[from];
    const dst = this.cells[to];
    for (let x = 0; x < this.width; x++) {
      const s = src[x];
      const d = dst[x];
      d.char = s.char;
      d.style = s.style;
      d.wideContinuation = s.wideContinuation;
      d.icon = s.icon;
      d.graphic = s.graphic;
    }
  }

  /**
   * Mirror a terminal scroll on this buffer (used on the prev-frame buffer after
   * emitting {@link scrollRegionSeq}): shift the band's rows by `delta` and mark
   * the revealed rows so the per-cell diff redraws exactly them. The revealed
   * rows get a sentinel char (never equal to a real cell) rather than blanks, so
   * the redraw is correct regardless of what fill colour SU/SD left behind.
   */
  public shiftRowsForScroll(top: number, bottom: number, delta: number): void {
    if (delta > 0) {
      for (let y = top; y <= bottom - delta; y++) this.copyRow(y + delta, y);
      for (let y = bottom - delta + 1; y <= bottom; y++) this.invalidateRow(y);
    } else if (delta < 0) {
      const d = -delta;
      for (let y = bottom; y >= top + d; y--) this.copyRow(y - d, y);
      for (let y = top; y <= top + d - 1; y++) this.invalidateRow(y);
    }
  }

  /**
   * Reset row `y` to a default blank — what SU/SD leaves in the revealed band.
   * The terminal pen is default when the scroll op runs (every frame ends with an
   * SGR reset), so the scrolled-in rows are default-background blanks; mirroring
   * that here lets the per-cell diff re-emit only the genuinely non-blank cells of
   * the new content instead of the whole row.
   */
  private invalidateRow(y: number): void {
    const row = this.cells[y];
    for (let x = 0; x < this.width; x++) {
      const c = row[x];
      c.char = " ";
      c.style = Style.DEFAULT;
      c.wideContinuation = false;
      c.icon = undefined;
      c.graphic = undefined;
    }
  }

  /**
   * Copy this buffer's contents into `other` (resizing it to match). Restrict to
   * rows `[yStart, yEnd)` for a partial-repaint frame — rows outside the damaged
   * band are already identical in `other`, so copying them is wasted work.
   */
  public copyTo(other: ScreenBuffer, yStart = 0, yEnd = this.height): void {
    if (this.width !== other.width || this.height !== other.height) {
      other.resize(this.width, this.height);
      yStart = 0;
      yEnd = this.height;
    }
    const y0 = Math.max(0, yStart);
    const y1 = Math.min(this.height, yEnd);
    for (let y = y0; y < y1; y++) {
      const src = this.cells[y];
      const dst = other.cells[y];
      for (let x = 0; x < this.width; x++) {
        const cell = src[x];
        // Copy fields into the destination cell in place — `other` is the
        // persistent prev-frame buffer, so reusing its cell objects avoids
        // reallocating the whole grid on every painted frame.
        const out = dst[x];
        out.char = cell.char;
        out.style = cell.style;
        out.wideContinuation = cell.wideContinuation;
        out.icon = cell.icon;
        out.graphic = cell.graphic;
      }
    }
  }
}
