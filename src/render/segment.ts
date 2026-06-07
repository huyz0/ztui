import { Style } from "./style.ts";

export function charWidth(char: string): number {
  const code = char.codePointAt(0);
  if (!code) return 0;
  // ASCII Control characters
  if (code < 32 || (code >= 127 && code < 160)) return 0;

  // CJK and wide characters:
  // 0x1100 - 0x115F: Hangul Jamo
  // 0x2E80 - 0xA4CF: CJK Radicals, Symbols, Bopomofo, Kana, Yi, etc.
  // 0xAC00 - 0xD7A3: Hangul Syllables
  // 0xF900 - 0xFAFF: CJK Compatibility Ideographs
  // 0xFE10 - 0xFE19: Vertical Forms
  // 0xFE30 - 0xFE6F: CJK Compatibility Forms
  // 0xFF00 - 0xFF60: Fullwidth ASCII
  // 0xFFE0 - 0xFFE6: Fullwidth Symbol
  // 0x1F300 - 0x1F9FF: Emojis
  // 0x20000 - 0x3FFFD: CJK Unified Ideographs Extension B/C/D/E/F, etc.
  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1f9ff) ||
    (code >= 0x20000 && code <= 0x2fa1f)
  ) {
    return 2;
  }
  return 1;
}

export function stringWidth(str: string): number {
  let width = 0;
  for (const char of str) {
    width += charWidth(char);
  }
  return width;
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
