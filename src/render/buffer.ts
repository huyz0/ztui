import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import { cursorMove, scrollRegionSeq, styleToEscapeCodes, styleTransition } from "./ansi-style.ts";
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
 * Whether a space in this style can be cleared with EL (`\x1b[K`) instead of
 * written as spaces. Restricted to the fully-default style: EL clears cells to
 * the terminal default, so only a default blank reproduces exactly (a foreground
 * colour is invisible on a blank but would still mismatch the cell's declared
 * style — and a background/reverse/underline genuinely renders differently). The
 * frame-cleared blanks behind shrunk text are exactly this, so it covers the
 * common case while staying provably identical.
 */
function isErasableBlank(style: Style): boolean {
  return style === Style.DEFAULT || style.equals(Style.DEFAULT);
}

/** True when `s` is non-empty and entirely ASCII spaces. */
function isSpaces(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) !== 32) return false;
  }
  return s.length > 0;
}

/**
 * Rewrite runs of an identical character using REP (`\x1b[nb`, "repeat the last
 * graphic char n times") — collapsing borders, rules and solid fills (`─`, `█`,
 * `░`, …) that would otherwise stream the same multi-byte glyph hundreds of times.
 * Only single-unit, single-width, printable chars are eligible (surrogate pairs
 * and wide glyphs are left intact), and only when REP is actually shorter than
 * writing the run out, so the result is never larger. Gated on the `repeatChar`
 * capability — never called on terminals that don't support REP.
 */
function compressRepeats(content: string): string {
  let out = "";
  let i = 0;
  const len = content.length;
  while (i < len) {
    const ch = content[i];
    let j = i + 1;
    while (j < len && content[j] === ch) j++;
    const run = j - i;
    const code = ch.charCodeAt(0);
    if (run >= 3 && code >= 0x20 && charWidth(ch) === 1) {
      const repeats = run - 1;
      const rep = `\x1b[${repeats}b`;
      const charBytes = code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
      if (rep.length < charBytes * repeats) {
        out += ch + rep; // one real glyph, then REP for the rest
        i = j;
        continue;
      }
    }
    out += content.slice(i, j);
    i = j;
  }
  return out;
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
  // Transient: whether the current renderDiff may use REP to compress identical
  // runs (set from the `allowRepeat` argument, read by flushRun). Diffs are not
  // re-entrant, so a plain field is safe.
  private diffRepeat = false;
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
    // When set, try to express the frame as a terminal scroll of a row band so
    // shifted content is moved by the terminal instead of re-emitted. Only valid
    // for a full-frame diff on a scroll-region-capable terminal (the App gates it).
    allowScroll = false,
    // When set, collapse identical-char runs with REP (`\x1b[nb`); the App passes
    // the terminal's `repeatChar` capability so it is only used where supported.
    allowRepeat = false,
  ): string {
    this.diffRepeat = allowRepeat;
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

    // Scroll optimization: when the entire frame is being diffed (not a damage
    // band) and the new frame is a clean vertical shift of the previous one, let
    // the terminal scroll the shared rows in place via its scroll region and
    // redraw only the revealed band. We mutate `oldBuffer` to mirror the post-
    // scroll screen, so the per-cell diff below naturally emits just those rows.
    if (
      allowScroll &&
      y0 === 0 &&
      limitH === this.height &&
      limitW === this.width &&
      !this.containsGraphics
    ) {
      const scroll = this.detectScroll(oldBuffer);
      if (scroll) {
        output += scrollRegionSeq(scroll.top, scroll.bottom, scroll.delta);
        oldBuffer.shiftRowsForScroll(scroll.top, scroll.bottom, scroll.delta);
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
    if (!cursor) {
      // Pen/position unknown (frame start, or after a special cell): absolute move.
      out += `\x1b[${y + 1};${x + 1}H`;
    } else {
      // Known cursor: emit the shortest positioning move (relative/CR/none),
      // never longer than the absolute CUP it replaces.
      out += cursorMove(cursor.x, cursor.y, x, y, this.width);
    }
    // Sticky SGR with minimal transitions: only (re)issue style codes when the
    // pen actually changes, and then emit just the *delta*. Runs that repeat a
    // style emit no SGR at all; runs that differ emit only the attributes that
    // changed instead of a full reset + re-set (which was the bulk of a frame's
    // escape bytes).
    if (lastStyle === null) {
      // Pen unknown (frame start, or after an inline graphic/icon cleared the
      // tracked style): emit a full reset + establish. `start` re-opens the
      // style's OSC-8 link if any.
      const { start } = styleToEscapeCodes(style);
      out += `\x1b[0m${start}`;
    } else if (!style.equals(lastStyle)) {
      // Pen is known to be `lastStyle`: transition the OSC-8 link explicitly
      // (`\x1b[0m` does not terminate a link, and the delta carries no link),
      // then emit the minimal SGR diff to reach `style`.
      if (lastStyle.link !== style.link) {
        if (lastStyle.link) out += "\x1b]8;;\x1b\\";
        if (style.link) out += `\x1b]8;;${style.link}\x1b\\`;
      }
      out += styleTransition(lastStyle, style);
    }

    // Erase-to-end-of-line: when this run is a plain default-background blank and
    // everything from `x` to the row's end is too, clear it with one EL (`\x1b[K`,
    // ~4 bytes) instead of writing a long string of spaces. The pen's background
    // is default here (the run's style is erasable → the transition above left it
    // default), so EL clears to the right colour. Common whenever a line's content
    // shrinks or a row blanks out. Only worth it past a few cells.
    if (
      content.length > 4 &&
      isErasableBlank(style) &&
      isSpaces(content) &&
      this.tailIsErasableBlank(y, x + content.length)
    ) {
      out += "\x1b[K";
      // EL does not advance the cursor — it stays where the clear began.
      return { out, cursor: { x, y }, lastStyle: style };
    }

    // REP-compress identical runs (borders/fills) where supported. The cursor
    // still advances by the run's visual width — REP moves it exactly as the
    // glyphs would — so positioning is unchanged.
    out += this.diffRepeat ? compressRepeats(content) : content;
    return {
      out,
      cursor: { x: x + stringWidth(content), y },
      lastStyle: style,
    };
  }

  /** Whether every new-frame cell in `[fromX, width)` of row `y` is an erasable blank. */
  private tailIsErasableBlank(y: number, fromX: number): boolean {
    const row = this.cells[y];
    for (let x = fromX; x < this.width; x++) {
      const c = row[x];
      if (c.char !== " " || c.icon !== undefined || c.graphic !== undefined) return false;
      if (!isErasableBlank(c.style)) return false;
    }
    return true;
  }

  /**
   * Whether any cell in rows `[yStart, yEnd)` differs from `old` — a cheap change
   * detector (early-exits, allocates nothing) for backends that re-present the
   * cell grid rather than consuming the ANSI diff. The encoding-free half of the
   * render path's change detection.
   */
  public differsFrom(old: ScreenBuffer, yStart = 0, yEnd = this.height): boolean {
    if (old.width !== this.width || old.height !== this.height) return true;
    const y0 = Math.max(0, yStart);
    const y1 = Math.min(this.height, yEnd);
    for (let y = y0; y < y1; y++) {
      if (!this.rowEqTo(old, y, y)) return true;
    }
    return false;
  }

  /** True when row `y` of this buffer is cell-for-cell identical to row `oy` of `old`. */
  private rowEqTo(old: ScreenBuffer, y: number, oy: number): boolean {
    const a = this.cells[y];
    const b = old.cells[oy];
    for (let x = 0; x < this.width; x++) {
      const c = a[x];
      const d = b[x];
      if (
        c.char !== d.char ||
        c.wideContinuation !== d.wideContinuation ||
        c.icon !== d.icon ||
        !graphicsEqual(c.graphic, d.graphic) ||
        !c.style.equals(d.style)
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * Detect a clean vertical scroll between `old` (previous frame) and this (new
   * frame): a single contiguous band of rows that is identical after shifting by
   * `delta` (`> 0` = scrolled up / revealed at the bottom, `< 0` = scrolled down /
   * revealed at the top). Returns null when no worthwhile shift explains the
   * change — the common case, so the boundary rows are checked first to bail fast.
   *
   * Conservative by design: it only fires on an *exact* shift of the changed band,
   * so anything subtler (a shift plus an in-band edit) falls back to the normal
   * per-cell diff. Static chrome above/below the scrolling viewport is naturally
   * excluded because it sits outside the changed band.
   */
  private detectScroll(old: ScreenBuffer): { top: number; bottom: number; delta: number } | null {
    if (old.width !== this.width || old.height !== this.height) return null;
    const H = this.height;

    let top = -1;
    for (let y = 0; y < H; y++) {
      if (!this.rowEqTo(old, y, y)) {
        top = y;
        break;
      }
    }
    if (top < 0) return null; // frames identical — nothing to scroll

    let bot = -1;
    for (let y = H - 1; y >= 0; y--) {
      if (!this.rowEqTo(old, y, y)) {
        bot = y;
        break;
      }
    }

    const bandH = bot - top + 1;
    // Too small a band can't save more than the scroll op costs.
    if (bandH < 3) return null;
    // At least this many rows must be shifted-and-shared (vs. redrawn) to bother.
    const MIN_SAVE = 2;

    // Scroll up by d: new[y] == old[y+d] across [top, bot-d]; reveal [bot-d+1, bot].
    for (let d = 1; d <= bandH - 1; d++) {
      if (!this.rowEqTo(old, top, top + d)) continue; // boundary mismatch — not this d
      let ok = true;
      for (let y = top; y <= bot - d; y++) {
        if (!this.rowEqTo(old, y, y + d)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      // Smallest clean shift found; if even this one doesn't pay, none will.
      return bandH - d >= MIN_SAVE && this.scrollSavesBytes(old, top, bot, d)
        ? { top, bottom: bot, delta: d }
        : null;
    }

    // Scroll down by d: new[y] == old[y-d] across [top+d, bot]; reveal [top, top+d-1].
    for (let d = 1; d <= bandH - 1; d++) {
      if (!this.rowEqTo(old, bot, bot - d)) continue;
      let ok = true;
      for (let y = top + d; y <= bot; y++) {
        if (!this.rowEqTo(old, y, y - d)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      return bandH - d >= MIN_SAVE && this.scrollSavesBytes(old, top, bot, -d)
        ? { top, bottom: bot, delta: -d }
        : null;
    }

    return null;
  }

  /**
   * Whether scrolling the band by `delta` emits fewer cells than the plain diff.
   * The plain diff re-emits every cell that differs between new[y] and old[y]
   * (unshifted) across the band; the scroll path emits only the non-blank cells
   * of the revealed rows (the shifted rows match exactly, so cost nothing). When
   * adjacent rows are near-identical the plain diff is already cheap and scrolling
   * would *lose* — this guard keeps the optimization to a strict byte win.
   */
  private scrollSavesBytes(old: ScreenBuffer, top: number, bottom: number, delta: number): boolean {
    let plain = 0;
    for (let y = top; y <= bottom; y++) {
      const a = this.cells[y];
      const b = old.cells[y];
      for (let x = 0; x < this.width; x++) {
        if (a[x].char !== b[x].char || !a[x].style.equals(b[x].style)) plain++;
      }
    }
    const revTop = delta > 0 ? bottom - delta + 1 : top;
    const revBot = delta > 0 ? bottom : top - delta - 1;
    let scroll = 0;
    for (let y = revTop; y <= revBot; y++) {
      const row = this.cells[y];
      for (let x = 0; x < this.width; x++) {
        if (row[x].char !== " " || row[x].style !== Style.DEFAULT) scroll++;
      }
    }
    return scroll < plain;
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
