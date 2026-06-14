import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { styleToEscapeCodes } from "./ansi-style.ts";
import { mix, parseColor, type RGB, rgbStr } from "./color.ts";
import type { Segment } from "./segment.ts";
import { charWidth, isControlChar, splitGraphemes, stringWidth } from "./segment.ts";
import { Style } from "./style.ts";

/** Concrete RGB to substitute when a cell's colour is `default`/unset. */
/** Concrete fallback colors a translucent blend composites against. */
export interface BlendBase {
  /** Background to blend toward. */
  bg: RGB;
  /** Foreground to blend toward. */
  fg: RGB;
}

/** An inline image/SVG attached to a cell, rendered per the backend's graphics protocol. */
export interface GraphicMetadata {
  /** Discriminant — currently always `"image"`. */
  type: "image";
  /**
   * Rasterized RGBA pixels for the terminal graphics protocols. Absent for a
   * vector graphic that the web/canvas backend rasterizes natively from {@link svg}.
   */
  pixelBuffer?: Uint8Array;
  /** Pixel width of the rasterized buffer. */
  pixelWidth?: number;
  /** Pixel height of the rasterized buffer. */
  pixelHeight?: number;
  /** Width of the image in cells. */
  cellWidth: number;
  /** Height of the image in cells. */
  cellHeight: number;
  /** Base64 PNG, used by protocols/backends that accept encoded images. */
  pngBase64?: string;
  /**
   * Raw SVG markup for native vector rendering on the canvas backend (`$theme`
   * tokens already resolved). When set, the canvas draws this directly — crisp at
   * the device pixel ratio — and the terminal pixel fields can be omitted.
   */
  svg?: string;
  /** Stacking order against other graphics. */
  zIndex?: number;
}

/** One grid cell: its glyph, style, and optional icon/graphic. */
export interface Cell {
  /** The character (may be a multi-code-point grapheme). */
  char: string;
  /** Visual style. */
  style: Style;
  /** True for the trailing half of a wide (2-cell) glyph. */
  wideContinuation: boolean;
  /** Registered icon name drawn in this cell, if any. */
  icon?: string;
  /** Inline graphic anchored at this cell, if any. */
  graphic?: GraphicMetadata;
}

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

  /** Reset every cell to a blank space with default style. */
  public clear(): void {
    for (let y = 0; y < this.height; y++) {
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

    if (w === 2) {
      // A wide glyph occupies two columns. If the second column is off-buffer or
      // outside the active clip, drawing the glyph would spill past the boundary
      // onto a neighbouring widget — substitute a space instead.
      const continuationFits =
        x + 1 < this.width && (!this.currentClip || this.currentClip.contains(x + 1, y));
      if (!continuationFits) {
        this.cells[y][x] = { char: " ", style, wideContinuation: false };
        return;
      }
      this.cells[y][x] = { char: safeChar, style, wideContinuation: false };
      this.cells[y][x + 1] = { char: "", style, wideContinuation: true };
      return;
    }

    this.cells[y][x] = { char: safeChar, style, wideContinuation: false };
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
  ): string {
    let output = "";
    const limitW = clipW !== undefined ? Math.min(clipW, this.width) : this.width;
    const limitH = clipH !== undefined ? Math.min(clipH, this.height) : this.height;

    // Ensure they are the same size
    if (this.width !== oldBuffer.width || this.height !== oldBuffer.height) {
      oldBuffer.resize(this.width, this.height);
      // Invalidate all cells to force redraw of every cell
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          oldBuffer.cells[y][x].char = "";
        }
      }
    }

    let cursor: { x: number; y: number } | null = null;

    // Invalidation pass: if a cell becomes wideContinuation but was previously text,
    // force redraw of its main cell to clear the old text and restore the graphic/wide char.
    for (let y = 0; y < limitH; y++) {
      for (let x = 0; x < limitW; x++) {
        const newCell = this.cells[y][x];
        const oldCell = oldBuffer.cells[y][x];
        if (newCell.wideContinuation && oldCell && !oldCell.wideContinuation) {
          let mainX = x - 1;
          while (mainX >= 0 && this.cells[y][mainX].wideContinuation) {
            mainX--;
          }
          if (mainX >= 0) {
            oldBuffer.cells[y][mainX].char = "";
          }
        }
      }
    }

    // Standard diff mode
    for (let y = 0; y < limitH; y++) {
      let runStartX: number | null = null;
      let runContent = "";

      for (let x = 0; x < limitW; x++) {
        const newCell = this.cells[y][x];
        const oldCell = oldBuffer.cells[y][x];

        const changed =
          newCell.char !== oldCell.char ||
          !newCell.style.equals(oldCell.style) ||
          newCell.wideContinuation !== oldCell.wideContinuation ||
          newCell.icon !== oldCell.icon ||
          newCell.graphic !== oldCell.graphic;

        const isSpecial =
          newCell.graphic !== undefined || newCell.icon !== undefined || newCell.wideContinuation;

        const styleChanged =
          runStartX !== null && !newCell.style.equals(this.cells[y][runStartX].style);

        if (isSpecial) {
          if (runStartX !== null) {
            const res = this.flushRun(
              runStartX,
              y,
              runContent,
              this.cells[y][runStartX].style,
              cursor,
            );
            output += res.out;
            cursor = res.cursor;
            runStartX = null;
            runContent = "";
          }
          if (changed && !newCell.wideContinuation) {
            const content = formatChar ? formatChar(newCell, oldCell) : newCell.char;
            const res = this.flushRun(x, y, content, newCell.style, cursor);
            output += res.out;
          }
          // After any special cell — a graphic, an icon, or the continuation
          // half of a wide glyph — we can no longer trust relative cursor
          // tracking. Terminals disagree with our width model for wide glyphs
          // (e.g. emoji rendered as width 1), so the run we just flushed may
          // have advanced the real cursor by a different amount than
          // `stringWidth` assumed. Force the next run to emit an absolute
          // cursor move; otherwise its content can stream from the wrong
          // column and leave stale fragments of the previous frame on screen.
          cursor = null;
          continue;
        }

        if (changed && !styleChanged) {
          if (runStartX === null) {
            runStartX = x;
          }
          runContent += formatChar ? formatChar(newCell, oldCell) : newCell.char;
        } else {
          // End of run or style change
          if (runStartX !== null) {
            const res = this.flushRun(
              runStartX,
              y,
              runContent,
              this.cells[y][runStartX].style,
              cursor,
            );
            output += res.out;
            cursor = res.cursor;
            runStartX = null;
            runContent = "";
          }
          if (changed) {
            runStartX = x;
            runContent += formatChar ? formatChar(newCell, oldCell) : newCell.char;
          }
        }
      }

      if (runStartX !== null) {
        const res = this.flushRun(runStartX, y, runContent, this.cells[y][runStartX].style, cursor);
        output += res.out;
        cursor = res.cursor;
      }
    }

    return output;
  }

  private flushRun(
    x: number,
    y: number,
    content: string,
    style: Style,
    cursor: { x: number; y: number } | null,
  ): { out: string; cursor: { x: number; y: number } } {
    let out = "";
    if (!cursor || cursor.y !== y || cursor.x !== x) {
      out += `\x1b[${y + 1};${x + 1}H`;
    }
    const { start, end } = styleToEscapeCodes(style);
    out += start + content + end;
    return {
      out,
      cursor: { x: x + stringWidth(content), y },
    };
  }

  /** Copy this buffer's contents into `other` (resizing it to match). */
  public copyTo(other: ScreenBuffer): void {
    if (this.width !== other.width || this.height !== other.height) {
      other.resize(this.width, this.height);
    }
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.cells[y][x];
        other.cells[y][x] = {
          char: cell.char,
          style: cell.style,
          wideContinuation: cell.wideContinuation,
          icon: cell.icon,
          graphic: cell.graphic,
        };
      }
    }
  }
}
