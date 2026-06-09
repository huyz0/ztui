import stringWidthLib from "string-width";
import { Style } from "./style.ts";

export function charWidth(char: string): number {
  const code = char.codePointAt(0);
  if (!code) return 0;
  // ASCII Control characters
  if (code < 32 || (code >= 127 && code < 160)) return 0;

  // Custom SVG icon PUA characters span 2 columns
  if (code >= 0xe000 && code <= 0xefff) return 2;

  return stringWidthLib(char);
}

export function stringWidth(str: string): number {
  let width = 0;
  for (const char of str) {
    width += charWidth(char);
  }
  return width;
}

/**
 * C0/C1 control characters (including raw \n, \t, \r, ESC) must never be written
 * into a screen cell: when the buffer is flushed they would be emitted verbatim
 * to the terminal, moving the cursor and corrupting the whole layout.
 */
export function isControlChar(char: string): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  return code < 32 || (code >= 127 && code < 160);
}

export class Segment {
  constructor(
    public readonly text: string,
    public readonly style: Style = Style.DEFAULT,
  ) {}

  public get cellLength(): number {
    return stringWidth(this.text);
  }

  // Crops a segment to fit within a cell width range [startCell, endCell)
  public crop(startCell: number, endCell: number): Segment {
    if (startCell <= 0 && endCell >= this.cellLength) {
      return this;
    }

    let currentCell = 0;
    let croppedText = "";

    for (const char of this.text) {
      const w = charWidth(char);
      if (currentCell >= endCell) {
        break;
      }
      if (currentCell >= startCell) {
        if (currentCell + w <= endCell) {
          croppedText += char;
        } else {
          // If a wide character crosses the boundary, fill with a space to maintain alignment
          croppedText += " ";
        }
      } else if (currentCell + w > startCell) {
        // Wide character starts before startCell but extends into it
        croppedText += " ";
      }
      currentCell += w;
    }

    return new Segment(croppedText, this.style);
  }
}
