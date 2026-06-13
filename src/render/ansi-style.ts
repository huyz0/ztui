import { parseColor } from "./color.ts";
import type { Style, UnderlineStyle } from "./style.ts";

/**
 * Terminal serialization for {@link Style}. This is the *terminal-specific* half
 * of the style system — it turns the backend-agnostic style data model into SGR
 * escape sequences. It lives apart from `style.ts` so non-terminal backends
 * (web/canvas, WASM) reuse `Style` as a pure data model without ever pulling in
 * ANSI generation. Consumed by the terminal render path (`buffer.renderDiff`).
 */

// SGR 4 sub-parameter values per the Kitty underline spec.
const UNDERLINE_SGR: Record<UnderlineStyle, number> = {
  single: 1,
  double: 2,
  curly: 3,
  dotted: 4,
  dashed: 5,
};

/** Colour-depth the connected terminal supports; set by the driver on startup. */
export interface RenderCapabilities {
  truecolor: boolean;
  color256: boolean;
}

// Mutable global so the driver can publish terminal capabilities without the
// render layer importing `core`/`driver` (which would invert the dependency).
export const renderCapabilities: RenderCapabilities = {
  truecolor: true,
  color256: true,
};

/** SGR start/end escape pair that renders `style`, for use around cell text. */
export function styleToEscapeCodes(style: Style): { start: string; end: string } {
  let start = "";
  let end = "";

  if (style.bold) {
    start += "\x1b[1m";
    end += "\x1b[22m";
  }
  if (style.dim) {
    start += "\x1b[2m";
    end += "\x1b[22m";
  }
  if (style.italic) {
    start += "\x1b[3m";
    end += "\x1b[23m";
  }
  if (style.underline) {
    // Colon sub-parameter form (Kitty/Ghostty/iTerm2/WezTerm). `4:1` is plain
    // single and degrades to bare `4` on terminals that ignore the sub-param.
    const sub = UNDERLINE_SGR[style.underlineStyle ?? "single"];
    start += `\x1b[4:${sub}m`;
    end += "\x1b[24m";
    if (style.underlineColor) {
      const c = parseColor(style.underlineColor)?.rgb;
      if (c) {
        start += `\x1b[58:2::${c.r}:${c.g}:${c.b}m`;
        end += "\x1b[59m";
      }
    }
  }
  if (style.strikethrough) {
    start += "\x1b[9m";
    end += "\x1b[29m";
  }
  if (style.reverse) {
    start += "\x1b[7m";
    end += "\x1b[27m";
  }

  if (style.color) {
    const fgCode = parseColorToAnsi(style.color, false);
    if (fgCode) {
      start += fgCode;
      end += "\x1b[39m";
    }
  }

  if (style.background) {
    const bgCode = parseColorToAnsi(style.background, true);
    if (bgCode) {
      start += bgCode;
      end += "\x1b[49m";
    }
  }

  if (style.link) {
    start = `\x1b]8;;${style.link}\x1b\\${start}`;
    end = `${end}\x1b]8;;\x1b\\`;
  }

  return { start, end };
}

// Map RGB values to the closest basic 16-colour index by Euclidean distance.
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

// Parse a color name, hex, or rgb() into an SGR colour escape, honouring the
// terminal's colour depth (truecolor → 256 → basic 16).
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
