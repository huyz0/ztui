import type { Region } from "../geometry/region.ts";
import type { Segment } from "./segment.ts";
import { charWidth } from "./segment.ts";
import { Style } from "./style.ts";

export interface Cell {
  char: string;
  style: Style;
  wideContinuation: boolean;
  icon?: string;
}

export class ScreenBuffer {
  public cells: Cell[][] = [];

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
      }
    }
  }

  public setCell(x: number, y: number, char: string, style: Style): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return;
    }
    const w = charWidth(char);
    this.cells[y][x] = { char, style, wideContinuation: false };

    // If it's a wide character, mark the next cell as continuation
    if (w === 2 && x + 1 < this.width) {
      this.cells[y][x + 1] = { char: "", style, wideContinuation: true };
    }
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
  public renderDiff(oldBuffer: ScreenBuffer, formatChar?: (cell: Cell) => string): string {
    let output = "";
    let activeStyle: Style | null = null;

    // Ensure they are the same size
    if (this.width !== oldBuffer.width || this.height !== oldBuffer.height) {
      // If sizes mismatch, draw the entire screen
      output += "\x1b[H"; // Cursor to home
      for (let y = 0; y < this.height; y++) {
        let line = "";
        for (let x = 0; x < this.width; x++) {
          const cell = this.cells[y][x];
          if (cell.wideContinuation) continue;

          if (!activeStyle || !activeStyle.equals(cell.style)) {
            if (line) {
              output += line;
              line = "";
            }
            if (activeStyle) {
              const { end } = activeStyle.getEscapeCodes();
              output += end;
            }
            activeStyle = cell.style;
            const { start } = activeStyle.getEscapeCodes();
            output += start;
          }
          line += formatChar ? formatChar(cell) : cell.char;
        }
        if (line) {
          output += line;
        }
        if (y < this.height - 1) {
          if (activeStyle) {
            output += activeStyle.getEscapeCodes().end;
            activeStyle = null;
          }
          output += "\r\n";
        }
      }
      if (activeStyle) {
        output += activeStyle.getEscapeCodes().end;
      }
      return output;
    }

    // Standard diff mode
    for (let y = 0; y < this.height; y++) {
      let runStartX: number | null = null;
      let runContent = "";

      for (let x = 0; x < this.width; x++) {
        const newCell = this.cells[y][x];
        const oldCell = oldBuffer.cells[y][x];

        const changed =
          newCell.char !== oldCell.char ||
          !newCell.style.equals(oldCell.style) ||
          newCell.wideContinuation !== oldCell.wideContinuation ||
          newCell.icon !== oldCell.icon;

        const styleChanged =
          runStartX !== null && !newCell.style.equals(this.cells[y][runStartX].style);

        if (changed && !styleChanged) {
          if (runStartX === null) {
            runStartX = x;
          }
          if (!newCell.wideContinuation) {
            runContent += formatChar ? formatChar(newCell) : newCell.char;
          }
        } else {
          // End of run or style change
          if (runStartX !== null) {
            output += this.flushRun(runStartX, y, runContent, this.cells[y][runStartX].style);
            runStartX = null;
            runContent = "";
          }
          if (changed) {
            runStartX = x;
            if (!newCell.wideContinuation) {
              runContent += formatChar ? formatChar(newCell) : newCell.char;
            }
          }
        }
      }

      if (runStartX !== null) {
        output += this.flushRun(runStartX, y, runContent, this.cells[y][runStartX].style);
      }
    }

    return output;
  }

  private flushRun(x: number, y: number, content: string, style: Style): string {
    // Escape sequence to move cursor to (x + 1, y + 1)
    let out = `\x1b[${y + 1};${x + 1}H`;
    const { start, end } = style.getEscapeCodes();
    out += start + content + end;
    return out;
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
        };
      }
    }
  }
}
