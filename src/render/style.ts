export interface StyleProps {
  color?: string; // e.g., "red", "#ff0000", "rgb(255, 0, 0)"
  background?: string; // e.g., "blue", "#0000ff"
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  reverse?: boolean;
  dim?: boolean;
}

export class Style {
  public readonly color?: string;
  public readonly background?: string;
  public readonly bold: boolean;
  public readonly italic: boolean;
  public readonly underline: boolean;
  public readonly reverse: boolean;
  public readonly dim: boolean;

  constructor(props: StyleProps = {}) {
    this.color = props.color;
    this.background = props.background;
    this.bold = !!props.bold;
    this.italic = !!props.italic;
    this.underline = !!props.underline;
    this.reverse = !!props.reverse;
    this.dim = !!props.dim;
  }

  public static readonly DEFAULT = new Style();

  public equals(other: Style): boolean {
    return (
      this.color === other.color &&
      this.background === other.background &&
      this.bold === other.bold &&
      this.italic === other.italic &&
      this.underline === other.underline &&
      this.reverse === other.reverse &&
      this.dim === other.dim
    );
  }

  public merge(other: StyleProps | Style): Style {
    return new Style({
      color: other.color !== undefined ? other.color : this.color,
      background: other.background !== undefined ? other.background : this.background,
      bold: other.bold !== undefined ? other.bold : this.bold,
      italic: other.italic !== undefined ? other.italic : this.italic,
      underline: other.underline !== undefined ? other.underline : this.underline,
      reverse: other.reverse !== undefined ? other.reverse : this.reverse,
      dim: other.dim !== undefined ? other.dim : this.dim,
    });
  }

  // Generate escape sequences for this style
  public getEscapeCodes(): { start: string; end: string } {
    let start = "";
    let end = "";

    if (this.bold) {
      start += "\x1b[1m";
      end += "\x1b[22m";
    }
    if (this.dim) {
      start += "\x1b[2m";
      end += "\x1b[22m";
    }
    if (this.italic) {
      start += "\x1b[3m";
      end += "\x1b[23m";
    }
    if (this.underline) {
      start += "\x1b[4m";
      end += "\x1b[24m";
    }
    if (this.reverse) {
      start += "\x1b[7m";
      end += "\x1b[27m";
    }

    if (this.color) {
      const fgCode = parseColorToAnsi(this.color, false);
      if (fgCode) {
        start += fgCode;
        end += "\x1b[39m";
      }
    }

    if (this.background) {
      const bgCode = parseColorToAnsi(this.background, true);
      if (bgCode) {
        start += bgCode;
        end += "\x1b[49m";
      }
    }

    return { start, end };
  }

  public apply(text: string): string {
    const { start, end } = this.getEscapeCodes();
    if (!start) return text;
    return start + text + end;
  }
}

// Utility to parse color name, hex, or rgb/rgba to ANSI escape sequences
function parseColorToAnsi(color: string, isBackground: boolean): string | null {
  const norm = color.trim().toLowerCase();
  const prefix = isBackground ? 48 : 38;

  // Basic colors (16 colors)
  const basicColors: Record<string, number> = {
    black: 0,
    red: 1,
    green: 2,
    yellow: 3,
    blue: 4,
    magenta: 5,
    cyan: 6,
    white: 7,
    gray: 8,
    grey: 8,
    "bright-black": 8,
    "bright-red": 9,
    "bright-green": 10,
    "bright-yellow": 11,
    "bright-blue": 12,
    "bright-magenta": 13,
    "bright-cyan": 14,
    "bright-white": 15,
  };

  if (basicColors[norm] !== undefined) {
    const code = basicColors[norm];
    if (code < 8) {
      return `\x1b[${isBackground ? 40 + code : 30 + code}m`;
    }
    return `\x1b[${isBackground ? 100 + (code - 8) : 90 + (code - 8)}m`;
  }

  // Hex colors: #rgb or #rrggbb
  if (norm.startsWith("#")) {
    const hex = norm.slice(1);
    let r = 0;
    let g = 0;
    let b = 0;
    if (hex.length === 3) {
      r = Number.parseInt(hex[0] + hex[0], 16);
      g = Number.parseInt(hex[1] + hex[1], 16);
      b = Number.parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = Number.parseInt(hex.slice(0, 2), 16);
      g = Number.parseInt(hex.slice(2, 4), 16);
      b = Number.parseInt(hex.slice(4, 6), 16);
    } else {
      return null;
    }
    return `\x1b[${prefix};2;${r};${g};${b}m`;
  }

  // rgb(r, g, b)
  const rgbMatch = norm.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgbMatch) {
    const r = Number.parseInt(rgbMatch[1]);
    const g = Number.parseInt(rgbMatch[2]);
    const b = Number.parseInt(rgbMatch[3]);
    return `\x1b[${prefix};2;${r};${g};${b}m`;
  }

  return null;
}
