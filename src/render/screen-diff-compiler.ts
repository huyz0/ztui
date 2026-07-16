import { cursorMove, scrollRegionSeq, styleToEscapeCodes, styleTransition } from "./ansi-style.ts";
import type { Cell } from "./cell.ts";
import { graphicsEqual } from "./cell.ts";
import { charWidth, stringWidth } from "./segment.ts";
import { Style } from "./style.ts";

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
  // Never rewrite content that carries its own escape sequences — an icon/image
  // cell's value is a raw graphics sequence (e.g. a sixel DCS) whose payload has
  // long runs of identical bytes. Injecting a REP escape into the middle of that
  // sequence corrupts it: the terminal aborts the DCS and prints the rest as
  // literal text. Plain text runs (the only thing we want to compress) never
  // contain ESC, so this guard is exact.
  if (content.indexOf("\x1b") !== -1) return content;
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
 * The subset of `ScreenBuffer` the diff compiler needs. Expressed as a
 * structural interface (rather than importing the `ScreenBuffer` class
 * itself) so this module and `buffer.ts` don't import each other — `buffer.ts`
 * already satisfies this shape, so no cast is needed at call sites.
 */
export interface DiffableBuffer {
  readonly width: number;
  readonly height: number;
  readonly cells: Cell[][];
  readonly containsGraphics: boolean;
  resize(width: number, height: number): void;
  shiftRowsForScroll(top: number, bottom: number, delta: number): void;
}

/**
 * Compiles the minimal ANSI escape-sequence diff between two {@link DiffableBuffer}
 * cell grids (the terminal backend's frame update), including scroll-region
 * detection for a clean vertical shift. Pure computation over two buffers it does
 * not own — it never mutates the "new" buffer, only (when scrolling) the "old"
 * one, to mirror the post-scroll screen the terminal will now show.
 */
export class ScreenDiffCompiler {
  // Transient: whether the current renderDiff may use REP to compress identical
  // runs (set from the `allowRepeat` argument, read by flushRun). Diffs are not
  // re-entrant, so a plain field is safe.
  private diffRepeat = false;

  /** Diff `buffer` against `oldBuffer` and return the ANSI to update only the changed cells. */
  public renderDiff(
    buffer: DiffableBuffer,
    oldBuffer: DiffableBuffer,
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
    const limitW = clipW !== undefined ? Math.min(clipW, buffer.width) : buffer.width;
    const limitH = clipH !== undefined ? Math.min(clipH, buffer.height) : buffer.height;
    const y0 = Math.max(0, yStart);

    // Ensure they are the same size
    if (buffer.width !== oldBuffer.width || buffer.height !== oldBuffer.height) {
      oldBuffer.resize(buffer.width, buffer.height);
      // Invalidate all cells to force redraw of every cell
      for (let y = 0; y < buffer.height; y++) {
        for (let x = 0; x < buffer.width; x++) {
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
      limitH === buffer.height &&
      limitW === buffer.width &&
      !buffer.containsGraphics
    ) {
      const scroll = this.detectScroll(buffer, oldBuffer);
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
        const newCell = buffer.cells[y][x];
        const oldCell = oldBuffer.cells[y][x];
        if (newCell.wideContinuation && oldCell && !oldCell.wideContinuation) {
          let mainX = x - 1;
          while (mainX >= 0 && buffer.cells[y][mainX].wideContinuation) {
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
        const newCell = buffer.cells[y][x];
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
          runStartX !== null && !newCell.style.equals(buffer.cells[y][runStartX].style);

        if (isSpecial) {
          if (runStartX !== null) {
            const res = this.flushRun(
              buffer,
              runStartX,
              y,
              runContent,
              buffer.cells[y][runStartX].style,
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
            const res = this.flushRun(buffer, x, y, content, newCell.style, cursor, lastStyle);
            output += res.out;
            lastStyle = res.lastStyle;
          } else if (newCell.wideContinuation && oldCell && (oldCell.icon || oldCell.graphic)) {
            // needsGraphicClear unconditionally exempts every continuation
            // cell, since a continuation of *this frame's own* icon/image
            // must never be cleared (would punch a hole in it). But this
            // continuation cell can also just be the trailing half of an
            // unrelated plain wide glyph (CJK, emoji, …) that happens to have
            // replaced an old icon/image lead sitting at this exact cell —
            // nothing this frame actually occupies that footprint, so the
            // stale icon must still be erased. Distinguish the two by
            // checking this frame's own nearest lead cell: only a genuine
            // (non-image) wide-glyph continuation gets the extra clear.
            let leadX = x - 1;
            while (leadX >= 0 && buffer.cells[y][leadX].wideContinuation) leadX--;
            const lead = leadX >= 0 ? buffer.cells[y][leadX] : undefined;
            const isRealImageContinuation = !!(lead && (lead.icon || lead.graphic));
            if (!isRealImageContinuation && formatChar) {
              const content = formatChar({ ...newCell, wideContinuation: false }, oldCell);
              if (content) {
                const res = this.flushRun(buffer, x, y, content, newCell.style, cursor, lastStyle);
                output += res.out;
                lastStyle = res.lastStyle;
              }
            }
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
              buffer,
              runStartX,
              y,
              runContent,
              buffer.cells[y][runStartX].style,
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
          buffer,
          runStartX,
          y,
          runContent,
          buffer.cells[y][runStartX].style,
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
    buffer: DiffableBuffer,
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
      out += cursorMove(cursor.x, cursor.y, x, y, buffer.width);
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
      this.tailIsErasableBlank(buffer, y, x + content.length)
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
  private tailIsErasableBlank(buffer: DiffableBuffer, y: number, fromX: number): boolean {
    const row = buffer.cells[y];
    for (let x = fromX; x < buffer.width; x++) {
      const c = row[x];
      if (c.char !== " " || c.icon !== undefined || c.graphic !== undefined) return false;
      if (!isErasableBlank(c.style)) return false;
    }
    return true;
  }

  /**
   * Whether any cell in rows `[yStart, yEnd)` of `buffer` differs from `old` — a
   * cheap change detector (early-exits, allocates nothing) for backends that
   * re-present the cell grid rather than consuming the ANSI diff. The
   * encoding-free half of the render path's change detection.
   */
  public differsFrom(
    buffer: DiffableBuffer,
    old: DiffableBuffer,
    yStart = 0,
    yEnd = buffer.height,
  ): boolean {
    if (old.width !== buffer.width || old.height !== buffer.height) return true;
    const y0 = Math.max(0, yStart);
    const y1 = Math.min(buffer.height, yEnd);
    for (let y = y0; y < y1; y++) {
      if (!this.rowEqTo(buffer, old, y, y)) return true;
    }
    return false;
  }

  /** True when row `y` of `buffer` is cell-for-cell identical to row `oy` of `old`. */
  private rowEqTo(buffer: DiffableBuffer, old: DiffableBuffer, y: number, oy: number): boolean {
    const a = buffer.cells[y];
    const b = old.cells[oy];
    for (let x = 0; x < buffer.width; x++) {
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
   * Detect a clean vertical scroll between `old` (previous frame) and `buffer`
   * (new frame): a single contiguous band of rows that is identical after
   * shifting by `delta` (`> 0` = scrolled up / revealed at the bottom, `< 0` =
   * scrolled down / revealed at the top). Returns null when no worthwhile shift
   * explains the change — the common case, so the boundary rows are checked
   * first to bail fast.
   *
   * Conservative by design: it only fires on an *exact* shift of the changed band,
   * so anything subtler (a shift plus an in-band edit) falls back to the normal
   * per-cell diff. Static chrome above/below the scrolling viewport is naturally
   * excluded because it sits outside the changed band.
   */
  private detectScroll(
    buffer: DiffableBuffer,
    old: DiffableBuffer,
  ): { top: number; bottom: number; delta: number } | null {
    if (old.width !== buffer.width || old.height !== buffer.height) return null;
    const H = buffer.height;

    let top = -1;
    for (let y = 0; y < H; y++) {
      if (!this.rowEqTo(buffer, old, y, y)) {
        top = y;
        break;
      }
    }
    if (top < 0) return null; // frames identical — nothing to scroll

    let bot = -1;
    for (let y = H - 1; y >= 0; y--) {
      if (!this.rowEqTo(buffer, old, y, y)) {
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
      if (!this.rowEqTo(buffer, old, top, top + d)) continue; // boundary mismatch — not this d
      let ok = true;
      for (let y = top; y <= bot - d; y++) {
        if (!this.rowEqTo(buffer, old, y, y + d)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      // Smallest clean shift found; if even this one doesn't pay, none will.
      return bandH - d >= MIN_SAVE && this.scrollSavesBytes(buffer, old, top, bot, d)
        ? { top, bottom: bot, delta: d }
        : null;
    }

    // Scroll down by d: new[y] == old[y-d] across [top+d, bot]; reveal [top, top+d-1].
    for (let d = 1; d <= bandH - 1; d++) {
      if (!this.rowEqTo(buffer, old, bot, bot - d)) continue;
      let ok = true;
      for (let y = top + d; y <= bot; y++) {
        if (!this.rowEqTo(buffer, old, y, y - d)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      return bandH - d >= MIN_SAVE && this.scrollSavesBytes(buffer, old, top, bot, -d)
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
  private scrollSavesBytes(
    buffer: DiffableBuffer,
    old: DiffableBuffer,
    top: number,
    bottom: number,
    delta: number,
  ): boolean {
    let plain = 0;
    for (let y = top; y <= bottom; y++) {
      const a = buffer.cells[y];
      const b = old.cells[y];
      for (let x = 0; x < buffer.width; x++) {
        if (a[x].char !== b[x].char || !a[x].style.equals(b[x].style)) plain++;
      }
    }
    const revTop = delta > 0 ? bottom - delta + 1 : top;
    const revBot = delta > 0 ? bottom : top - delta - 1;
    let scroll = 0;
    for (let y = revTop; y <= revBot; y++) {
      const row = buffer.cells[y];
      for (let x = 0; x < buffer.width; x++) {
        if (row[x].char !== " " || !isErasableBlank(row[x].style)) scroll++;
      }
    }
    return scroll < plain;
  }
}
