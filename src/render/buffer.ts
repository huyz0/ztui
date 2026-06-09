import { Offset } from "../geometry/offset.ts";
import { Region } from "../geometry/region.ts";
import { Size } from "../geometry/size.ts";
import type { Segment } from "./segment.ts";
import { charWidth, isControlChar, stringWidth } from "./segment.ts";
import { Style } from "./style.ts";

export interface GraphicMetadata {
  type: "image";
  pixelBuffer: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
  cellWidth: number;
  cellHeight: number;
  pngBase64?: string;
  zIndex?: number;
}

export interface Cell {
  char: string;
  style: Style;
  wideContinuation: boolean;
  icon?: string;
  graphic?: GraphicMetadata;
}

export class ScreenBuffer {
  public cells: Cell[][] = [];
  private clipStack: (Region | null)[] = [];
  public currentClip: Region | null = null;

  constructor(
    public width = 0,
    public height = 0,
  ) {
    this.resize(width, height);
  }

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

  public pushClip(region: Region): void {
    this.clipStack.push(this.currentClip);
    if (this.currentClip) {
      const intersect = this.currentClip.intersection(region);
      this.currentClip = intersect || new Region(Offset.ORIGIN, Size.ZERO);
    } else {
      this.currentClip = region;
    }
  }

  public popClip(): void {
    if (this.clipStack.length > 0) {
      this.currentClip = this.clipStack.pop() || null;
    }
  }

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

  public drawSegment(startX: number, startY: number, segment: Segment, clipRegion?: Region): void {
    if (startY < 0 || startY >= this.height) return;

    let x = startX;
    const y = startY;

    for (const char of segment.text) {
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

  // Double buffering output: compare with old buffer and write changes to terminal
  // Returns ANSI escape sequences to render the differences
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
          if (changed) {
            if (!newCell.wideContinuation) {
              const content = formatChar ? formatChar(newCell, oldCell) : newCell.char;
              const res = this.flushRun(x, y, content, newCell.style, cursor);
              output += res.out;
              // Reset cursor to null after a special cell as we don't track its precise terminal cursor movement
              cursor = null;
            }
          }
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
    const { start, end } = style.getEscapeCodes();
    out += start + content + end;
    return {
      out,
      cursor: { x: x + stringWidth(content), y },
    };
  }

  // Copy current buffer content to another buffer
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
