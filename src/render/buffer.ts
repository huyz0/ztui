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

/**
 * Value-equality for two cell graphics. The widget layer rebuilds the
 * {@link GraphicMetadata} object every render even when the picture is identical
 * (the heavy `pngBase64`/pixel data is cached and reused), so a reference check
 * would report a change on every frame and needlessly delete + re-transmit the
 * image — which can drop it on a terminal's stateful graphics layer. Comparing by
 * value lets an unchanged image be left in place across full frames (e.g. while
 * scrolling an unrelated panel).
 */
export function graphicsEqual(a?: GraphicMetadata, b?: GraphicMetadata): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.pngBase64 === b.pngBase64 &&
    a.cellWidth === b.cellWidth &&
    a.cellHeight === b.cellHeight &&
    a.pixelWidth === b.pixelWidth &&
    a.pixelHeight === b.pixelHeight &&
    a.zIndex === b.zIndex &&
    a.svg === b.svg
  );
}

/**
 * Whether a per-cell graphics-erase must be emitted before drawing this cell:
 * the previous frame held an icon/graphic here that is now different or gone.
 *
 * A cell that continues a *current* image ({@link Cell.wideContinuation}) is
 * never cleared — its lead cell's image already spans this footprint, and the
 * erase paints an opaque rectangle that (on sixel, which has no global delete)
 * punches a black hole into the freshly-drawn image.
 */
export function needsGraphicClear(cell: Cell, oldCell?: Cell): boolean {
  const oldHadImage = !!(oldCell && (oldCell.icon || oldCell.graphic));
  if (!oldHadImage || cell.wideContinuation) return false;
  return oldCell.icon !== cell.icon || !graphicsEqual(oldCell.graphic, cell.graphic);
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
  ): string {
    let output = "";
    const limitW = clipW !== undefined ? Math.min(clipW, this.width) : this.width;
    const limitH = clipH !== undefined ? Math.min(clipH, this.height) : this.height;
    const y0 = Math.max(0, yStart);

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
    // The style currently set on the terminal ("pen"). Tracked across runs so a
    // run only (re)issues SGR codes when the pen actually changes (see flushRun).
    let lastStyle: Style | null = null;

    // Invalidation pass: if a cell becomes wideContinuation but was previously text,
    // force redraw of its main cell to clear the old text and restore the graphic/wide char.
    for (let y = y0; y < limitH; y++) {
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
    for (let y = y0; y < limitH; y++) {
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
          !graphicsEqual(newCell.graphic, oldCell.graphic);

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
              lastStyle,
            );
            output += res.out;
            cursor = res.cursor;
            lastStyle = res.lastStyle;
            runStartX = null;
            runContent = "";
          }
          if (changed && !newCell.wideContinuation) {
            const content = formatChar ? formatChar(newCell, oldCell) : newCell.char;
            const res = this.flushRun(x, y, content, newCell.style, cursor, lastStyle);
            output += res.out;
            lastStyle = res.lastStyle;
          }
          // After any special cell — a graphic, an icon, or the continuation
          // half of a wide glyph — we can no longer trust relative cursor
          // tracking. Terminals disagree with our width model for wide glyphs
          // (e.g. emoji rendered as width 1), so the run we just flushed may
          // have advanced the real cursor by a different amount than
          // `stringWidth` assumed. Force the next run to emit an absolute
          // cursor move; otherwise its content can stream from the wrong
          // column and leave stale fragments of the previous frame on screen.
          // An inline graphic/icon sequence also leaves the terminal pen in an
          // unknown state, so drop the tracked style to re-issue it next run.
          // Close any open hyperlink first — nulling the pen would otherwise lose
          // track of it and leave it bleeding onto subsequent output.
          if (lastStyle?.link) output += "\x1b]8;;\x1b\\";
          cursor = null;
          lastStyle = null;
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
              lastStyle,
            );
            output += res.out;
            cursor = res.cursor;
            lastStyle = res.lastStyle;
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
        const res = this.flushRun(
          runStartX,
          y,
          runContent,
          this.cells[y][runStartX].style,
          cursor,
          lastStyle,
        );
        output += res.out;
        cursor = res.cursor;
        lastStyle = res.lastStyle;
      }
    }

    // Return the terminal to the default pen after the frame's last styled run,
    // matching the per-run reset the old serialization always left behind. Close
    // a trailing hyperlink too, for the same reason as above.
    if (output.length > 0) {
      if (lastStyle?.link) output += "\x1b]8;;\x1b\\";
      output += "\x1b[0m";
    }

    return output;
  }

  private flushRun(
    x: number,
    y: number,
    content: string,
    style: Style,
    cursor: { x: number; y: number } | null,
    lastStyle: Style | null,
  ): { out: string; cursor: { x: number; y: number }; lastStyle: Style } {
    let out = "";
    if (!cursor || cursor.y !== y || cursor.x !== x) {
      out += `\x1b[${y + 1};${x + 1}H`;
    }
    // Sticky SGR: only (re)issue style codes when the pen actually changes from
    // what we last emitted. A leading full reset clears any attribute the
    // previous run set that this one omits; the matching trailing reset is
    // deferred to the end of the frame. Runs that repeat a style emit no SGR at
    // all — the bulk of a frame's escape bytes used to be this redundant reset +
    // re-set between same-style runs.
    if (lastStyle === null || !style.equals(lastStyle)) {
      // Close a hyperlink the previous run left open before we reset — `\x1b[0m`
      // is SGR and does not terminate an OSC-8 link, so it would otherwise bleed
      // onto this run. The new style's `start` re-opens its own link if any.
      if (lastStyle?.link && lastStyle.link !== style.link) out += "\x1b]8;;\x1b\\";
      const { start } = styleToEscapeCodes(style);
      out += `\x1b[0m${start}`;
    }
    out += content;
    return {
      out,
      cursor: { x: x + stringWidth(content), y },
      lastStyle: style,
    };
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
