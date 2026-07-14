import { Segment, stringWidth } from "../segment.ts";
import { Style } from "../style.ts";

/** One rendered cell: a single grapheme and the style it was written with. */
export interface AnsiCell {
  ch: string;
  style: Style;
}

const BASIC = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"] as const;

/** Convert an xterm 256-palette index to a `#rrggbb` string. */
function xterm256ToHex(n: number): string {
  if (n < 16) {
    // Standard + bright; approximate with the canonical xterm values.
    const table = [
      "#000000",
      "#800000",
      "#008000",
      "#808000",
      "#000080",
      "#800080",
      "#008080",
      "#c0c0c0",
      "#808080",
      "#ff0000",
      "#00ff00",
      "#ffff00",
      "#0000ff",
      "#ff00ff",
      "#00ffff",
      "#ffffff",
    ];
    return table[n];
  }
  if (n >= 232) {
    const v = 8 + (n - 232) * 10;
    const h = v.toString(16).padStart(2, "0");
    return `#${h}${h}${h}`;
  }
  const i = n - 16;
  const r = Math.floor(i / 36);
  const g = Math.floor((i % 36) / 6);
  const b = i % 6;
  const step = (c: number) => (c === 0 ? 0 : 55 + c * 40);
  const hex = (c: number) => step(c).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * A small, **contained** ANSI/VT terminal emulator. It parses a byte stream of
 * command output (SGR colors/styles, `\r`, `\n`, `\t`, backspace, common CSI
 * cursor moves and line erases) into an internal grid of {@link AnsiCell}s.
 *
 * It is deliberately a *sandbox*: it owns its own cursor and line buffer, never
 * touches a real terminal, and silently drops sequences that would let output
 * escape a viewport — alternate-screen switches, scroll-region changes, full
 * cursor-home addressing, OSC title/clipboard, etc. So hostile or sloppy child
 * output can garble its own little view but can never corrupt the host app.
 */
export class AnsiTerminal {
  /** All lines (scrollback + current); each is a sparse array of cells. */
  public lines: AnsiCell[][] = [[]];
  /** Column count used for auto-wrap; 0 disables wrapping. */
  public cols = 0;
  /** Lines retained; older lines scroll off the top. */
  public maxLines = 5000;

  private row = 0;
  private col = 0;
  private style = new Style({});
  // A trailing, not-yet-complete escape sequence carried to the next write().
  private pending = "";

  public reset(): void {
    this.lines = [[]];
    this.row = 0;
    this.col = 0;
    this.style = new Style({});
    this.pending = "";
  }

  private line(r: number): AnsiCell[] {
    while (this.lines.length <= r) this.lines.push([]);
    return this.lines[r];
  }

  private newline(): void {
    this.row++;
    this.col = 0;
    this.line(this.row);
    this.trim();
  }

  private trim(): void {
    if (this.lines.length > this.maxLines) {
      const drop = this.lines.length - this.maxLines;
      this.lines.splice(0, drop);
      this.row = Math.max(0, this.row - drop);
    }
  }

  private putChar(ch: string): void {
    const w = stringWidth(ch);
    if (w <= 0) return; // skip control/combining we don't place
    if (this.cols > 0 && this.col >= this.cols) this.newline();
    const line = this.line(this.row);
    while (line.length < this.col) line.push({ ch: " ", style: this.style });
    line[this.col] = { ch, style: this.style };
    this.col++;
    if (w === 2) {
      // Wide glyph: occupy the next cell with a zero-width continuation.
      line[this.col] = { ch: "", style: this.style };
      this.col++;
    }
  }

  private eraseInLine(mode: number): void {
    const line = this.line(this.row);
    const blank = { ch: " ", style: this.style };
    if (mode === 0) {
      // Cursor to end of line.
      line.length = Math.min(line.length, this.col);
    } else if (mode === 1) {
      for (let i = 0; i <= this.col && i < line.length; i++) line[i] = blank;
    } else if (mode === 2) {
      line.length = 0;
    }
  }

  /** Apply an SGR (`m`) parameter list to the current style. */
  private applySgr(params: number[]): void {
    if (params.length === 0) params = [0];
    const props: Record<string, unknown> = {};
    let cur = this.style;
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      switch (true) {
        case p === 0:
          cur = new Style({});
          // Clear params accumulated earlier in this SGR list too — a reset
          // must win over any set that preceded it in the same sequence
          // (e.g. `ESC[1;0m`), not just the base style it merges onto.
          for (const k of Object.keys(props)) delete props[k];
          break;
        case p === 1:
          props.bold = true;
          break;
        case p === 2:
          props.dim = true;
          break;
        case p === 3:
          props.italic = true;
          break;
        case p === 4:
          props.underline = true;
          break;
        case p === 7:
          props.reverse = true;
          break;
        case p === 9:
          props.strikethrough = true;
          break;
        case p === 22:
          props.bold = false;
          props.dim = false;
          break;
        case p === 23:
          props.italic = false;
          break;
        case p === 24:
          props.underline = false;
          break;
        case p === 27:
          props.reverse = false;
          break;
        case p === 29:
          props.strikethrough = false;
          break;
        case p >= 30 && p <= 37:
          props.color = BASIC[p - 30];
          break;
        case p === 39:
          props.color = "default";
          break;
        case p >= 90 && p <= 97:
          props.color = `bright-${BASIC[p - 90]}`;
          break;
        case p >= 40 && p <= 47:
          props.background = BASIC[p - 40];
          break;
        case p === 49:
          props.background = "default";
          break;
        case p >= 100 && p <= 107:
          props.background = `bright-${BASIC[p - 100]}`;
          break;
        case p === 38 || p === 48: {
          // Extended color: 5;n (256) or 2;r;g;b (truecolor).
          const key = p === 38 ? "color" : "background";
          if (params[i + 1] === 5) {
            props[key] = xterm256ToHex(params[i + 2] ?? 0);
            i += 2;
          } else if (params[i + 1] === 2) {
            const r = params[i + 2] ?? 0;
            const g = params[i + 3] ?? 0;
            const b = params[i + 4] ?? 0;
            props[key] = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
            i += 4;
          }
          break;
        }
        // Anything else (blink, fonts, etc.) is ignored.
      }
    }
    this.style = cur.merge(props as never);
  }

  /** Handle one CSI sequence given its parameter string and final byte. */
  private handleCsi(paramStr: string, final: string): void {
    // Drop private (`?`-prefixed) modes — alt screen, cursor visibility, etc.
    if (paramStr.startsWith("?")) return;
    const params =
      paramStr === "" ? [] : paramStr.split(";").map((s) => Number.parseInt(s, 10) || 0);
    const n = params[0] ?? 0;
    switch (final) {
      case "m":
        this.applySgr(params);
        break;
      case "A": // cursor up
        this.row = Math.max(0, this.row - Math.max(1, n));
        break;
      case "B": // cursor down
        this.row = this.row + Math.max(1, n);
        this.line(this.row);
        break;
      case "C": // cursor forward
        this.col += Math.max(1, n);
        if (this.cols > 0) this.col = Math.min(this.col, this.cols - 1);
        break;
      case "D": // cursor back
        this.col = Math.max(0, this.col - Math.max(1, n));
        break;
      case "G": // cursor to column n (1-based)
        this.col = Math.max(0, (n || 1) - 1);
        break;
      case "K": // erase in line
        this.eraseInLine(n);
        break;
      // H/f (absolute home), J (erase display), r (scroll region), S/T (scroll),
      // and everything else are intentionally ignored to keep output contained.
    }
  }

  /**
   * Feed a chunk of output. Sequences split across chunk boundaries are
   * buffered and completed on the next call.
   */
  public write(data: string): void {
    const s = this.pending + data;
    this.pending = "";
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === "\x1b") {
        const consumed = this.parseEscape(s, i);
        if (consumed < 0) {
          // Incomplete escape at end of chunk; carry it over.
          this.pending = s.slice(i);
          return;
        }
        i += consumed;
        continue;
      }
      if (ch === "\n") {
        this.newline();
      } else if (ch === "\r") {
        this.col = 0;
      } else if (ch === "\t") {
        this.col =
          this.cols > 0
            ? Math.min(this.cols - 1, (Math.floor(this.col / 8) + 1) * 8)
            : (Math.floor(this.col / 8) + 1) * 8;
      } else if (ch === "\b") {
        this.col = Math.max(0, this.col - 1);
      } else if (ch >= " ") {
        this.putChar(ch);
      }
      i++;
    }
  }

  /**
   * Parse an escape starting at `start`. Returns the number of chars consumed,
   * or -1 if the sequence is incomplete (needs more input).
   */
  private parseEscape(s: string, start: number): number {
    // s[start] === ESC
    if (start + 1 >= s.length) return -1;
    const kind = s[start + 1];

    if (kind === "[") {
      // CSI: ESC [ params... finalByte (0x40–0x7E)
      let j = start + 2;
      while (j < s.length) {
        const c = s[j];
        if (c >= "\x40" && c <= "\x7e") {
          this.handleCsi(s.slice(start + 2, j), c);
          return j - start + 1;
        }
        j++;
      }
      return -1; // unterminated
    }

    if (kind === "]") {
      // OSC: ESC ] ... (BEL | ESC \) — title/clipboard/etc. Consume and ignore.
      let j = start + 2;
      while (j < s.length) {
        if (s[j] === "\x07") return j - start + 1;
        if (s[j] === "\x1b" && s[j + 1] === "\\") return j - start + 2;
        if (s[j] === "\x1b" && j + 1 >= s.length) return -1;
        j++;
      }
      return -1;
    }

    // Charset designators (ESC ( B, ESC ) 0, …) are three bytes.
    if (kind === "(" || kind === ")" || kind === "*" || kind === "+") {
      return start + 2 < s.length ? 3 : -1;
    }
    // Other two-byte escapes (ESC =, ESC >, …): skip the next byte.
    return 2;
  }
}

/** Group a cell row into styled segments, coalescing runs of equal style. */
export function cellsToSegments(cells: AnsiCell[]): Segment[] {
  const out: Segment[] = [];
  let text = "";
  let style: Style | null = null;
  for (const cell of cells) {
    if (style && cell.style === style) {
      text += cell.ch;
    } else {
      if (style && text) out.push(new Segment(text, style));
      text = cell.ch;
      style = cell.style;
    }
  }
  if (style && text) out.push(new Segment(text, style));
  return out;
}
