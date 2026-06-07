export interface StyleProps {
  color?: string; // e.g., "red", "#ff0000", "rgb(255, 0, 0)"
  background?: string; // e.g., "blue", "#0000ff"
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  reverse?: boolean;
  dim?: boolean;
  strikethrough?: boolean;
  link?: string;
}

export interface RenderCapabilities {
  truecolor: boolean;
  color256: boolean;
}

// Global capabilities reference to prevent circular core imports
export const renderCapabilities: RenderCapabilities = {
  truecolor: true,
  color256: true,
};

export class Style {
  public readonly color?: string;
  public readonly background?: string;
  public readonly bold: boolean;
  public readonly italic: boolean;
  public readonly underline: boolean;
  public readonly reverse: boolean;
  public readonly dim: boolean;
  public readonly strikethrough: boolean;
  public readonly link?: string;

  constructor(props: StyleProps = {}) {
    this.color = props.color;
    this.background = props.background;
    this.bold = !!props.bold;
    this.italic = !!props.italic;
    this.underline = !!props.underline;
    this.reverse = !!props.reverse;
    this.dim = !!props.dim;
    this.strikethrough = !!props.strikethrough;
    this.link = props.link;
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
      this.dim === other.dim &&
      this.strikethrough === other.strikethrough &&
      this.link === other.link
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
      strikethrough: other.strikethrough !== undefined ? other.strikethrough : this.strikethrough,
      link: other.link !== undefined ? other.link : this.link,
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
    if (this.strikethrough) {
      start += "\x1b[9m";
      end += "\x1b[29m";
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

    if (this.link) {
      start = `\x1b]8;;${this.link}\x1b\\${start}`;
      end = `${end}\x1b]8;;\x1b\\`;
    }

    return { start, end };
  }

  public apply(text: string): string {
    const { start, end } = this.getEscapeCodes();
    if (!start) return text;
    return start + text + end;
  }
}

// Helper to map RGB values to the closest basic 16 ANSI color using Euclidean distance
function getClosestBasicColor(r: number, g: number, b: number): number {
  const ansiRGBs = [
    { r: 0, g: 0, b: 0 }, // 0: black
    { r: 128, g: 0, b: 0 }, // 1: red
    { r: 0, g: 128, b: 0 }, // 2: green
    { r: 128, g: 128, b: 0 }, // 3: yellow
    { r: 0, g: 0, b: 128 }, // 4: blue
    { r: 128, g: 0, b: 128 }, // 5: magenta
    { r: 0, g: 128, b: 128 }, // 6: cyan
    { r: 192, g: 192, b: 192 }, // 7: white
    { r: 128, g: 128, b: 128 }, // 8: bright-black / gray
    { r: 255, g: 0, b: 0 }, // 9: bright-red
    { r: 0, g: 255, b: 0 }, // 10: bright-green
    { r: 255, g: 255, b: 0 }, // 11: bright-yellow
    { r: 0, g: 0, b: 255 }, // 12: bright-blue
    { r: 255, g: 0, b: 255 }, // 13: bright-magenta
    { r: 0, g: 255, b: 255 }, // 14: bright-cyan
    { r: 255, g: 255, b: 255 }, // 15: bright-white
  ];

  let minDistance = Number.MAX_VALUE;
  let closestIndex = 0;

  for (let i = 0; i < ansiRGBs.length; i++) {
    const dr = r - ansiRGBs[i].r;
    const dg = g - ansiRGBs[i].g;
    const db = b - ansiRGBs[i].b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < minDistance) {
      minDistance = dist;
      closestIndex = i;
    }
  }

  return closestIndex;
}

// Utility to parse color name, hex, or rgb/rgba to ANSI escape sequences
function parseColorToAnsi(color: string, isBackground: boolean): string | null {
  const norm = color.trim().toLowerCase();
  const prefix = isBackground ? 48 : 38;

  if (norm === "default") {
    return `\x1b[${isBackground ? 49 : 39}m`;
  }

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

  let r = 0;
  let g = 0;
  let b = 0;
  let parsed = false;

  // Hex colors: #rgb or #rrggbb
  if (norm.startsWith("#")) {
    const hex = norm.slice(1);
    if (hex.length === 3) {
      r = Number.parseInt(hex[0] + hex[0], 16);
      g = Number.parseInt(hex[1] + hex[1], 16);
      b = Number.parseInt(hex[2] + hex[2], 16);
      parsed = true;
    } else if (hex.length === 6) {
      r = Number.parseInt(hex.slice(0, 2), 16);
      g = Number.parseInt(hex.slice(2, 4), 16);
      b = Number.parseInt(hex.slice(4, 6), 16);
      parsed = true;
    }
  } else {
    // rgb(r, g, b)
    const rgbMatch = norm.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
    if (rgbMatch) {
      r = Number.parseInt(rgbMatch[1], 10);
      g = Number.parseInt(rgbMatch[2], 10);
      b = Number.parseInt(rgbMatch[3], 10);
      parsed = true;
    }
  }

  if (!parsed) {
    return null;
  }

  if (renderCapabilities.truecolor) {
    return `\x1b[${prefix};2;${r};${g};${b}m`;
  }

  if (renderCapabilities.color256) {
    const rIdx = Math.round((r / 255) * 5);
    const gIdx = Math.round((g / 255) * 5);
    const bIdx = Math.round((b / 255) * 5);
    const index = 16 + 36 * rIdx + 6 * gIdx + bIdx;
    return `\x1b[${prefix};5;${index}m`;
  }

  // Fallback to closest 16-color index
  const closestIndex = getClosestBasicColor(r, g, b);
  if (closestIndex < 8) {
    return `\x1b[${isBackground ? 40 + closestIndex : 30 + closestIndex}m`;
  }
  return `\x1b[${isBackground ? 100 + (closestIndex - 8) : 90 + (closestIndex - 8)}m`;
}
