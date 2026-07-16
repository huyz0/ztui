/** Small RGB helpers shared by colour-driven widgets (progress, spinners). */

/** An 8-bit-per-channel RGB color (`0–255`). */
export type RGB = {
  /** Red channel. */
  r: number;
  /** Green channel. */
  g: number;
  /** Blue channel. */
  b: number;
};

export const BLACK: RGB = { r: 0, g: 0, b: 0 };
export const WHITE: RGB = { r: 255, g: 255, b: 255 };

/** Parse `#rgb`, `#rrggbb`, or `rgb(r,g,b)` to channels; null if unrecognised. */
export function parseRgb(color: string): RGB | null {
  const norm = color.trim().toLowerCase();
  if (norm.startsWith("#")) {
    const hex = norm.slice(1);
    if (hex.length === 3) {
      return {
        r: Number.parseInt(hex[0] + hex[0], 16),
        g: Number.parseInt(hex[1] + hex[1], 16),
        b: Number.parseInt(hex[2] + hex[2], 16),
      };
    }
    if (hex.length === 6) {
      return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
      };
    }
    return null;
  }
  const m = norm.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return null;
}

/** Linear blend between two colours; `t` 0 → `a`, 1 → `b`. */
export function mix(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

export const rgbStr = (c: RGB): string => `rgb(${c.r}, ${c.g}, ${c.b})`;

/**
 * Pick a near-black or near-white text colour that reads cleanly on `bg`, by
 * `bg`'s relative luminance. Unlike `isColorLight`, this parses `rgb(...)` too
 * (so it stays correct as a colour animates) and returns soft poles rather than
 * harsh pure black/white. Falls back to white for unparseable input.
 */
export function contrastText(bg: string): string {
  const rgb = parseRgb(bg);
  if (!rgb) return "#ffffff";
  const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  // Threshold biased above mid (0.6): only genuinely light fills get dark text,
  // so mid-tone accents (a red/blue button) keep crisp white text and only flip
  // once the focus glow brightens them near the light end.
  return lum > 0.6 ? "#0a0a0a" : "#ffffff";
}

/**
 * Interpolate between two CSS colours, returning an `rgb(...)` string at
 * fraction `t` (0 → `from`, 1 → `to`). Unparseable endpoints fall back to the
 * other end, so a tween from/to `default` degrades to a hold rather than a throw.
 */
export function lerpColor(from: string, to: string, t: number): string {
  const a = parseColor(from)?.rgb;
  const b = parseColor(to)?.rgb;
  if (!a && !b) return to;
  if (!a) return rgbStr(b as RGB);
  if (!b) return rgbStr(a);
  return rgbStr(mix(a, b, t < 0 ? 0 : t > 1 ? 1 : t));
}

/** The 16 basic ANSI colour names, as concrete RGB (xterm palette subset). */
const NAMED_RGB: Record<string, RGB> = {
  black: { r: 0, g: 0, b: 0 },
  red: { r: 205, g: 0, b: 0 },
  green: { r: 0, g: 205, b: 0 },
  yellow: { r: 205, g: 205, b: 0 },
  blue: { r: 0, g: 0, b: 238 },
  magenta: { r: 205, g: 0, b: 205 },
  cyan: { r: 0, g: 205, b: 205 },
  white: { r: 229, g: 229, b: 229 },
  gray: { r: 127, g: 127, b: 127 },
  grey: { r: 127, g: 127, b: 127 },
};

/**
 * The 16-slot ANSI colour palette (indices 0-15), in the "standard" 0/128/192/255
 * values ECMA-48 terminals default to absent a custom palette. This is the
 * canonical table for anything that needs to *degrade to or quantize against*
 * the 16-colour ANSI space (SGR 30-37/90-97 downgrade, icon/glyph colour
 * matching) — kept deliberately separate from {@link NAMED_RGB} above, which
 * uses xterm's own (different) default palette for parsing a CSS-ish colour
 * name into a colour to blend/animate. The two tables answering "what RGB is
 * red?" differently is intentional, not drift: one models the fallback palette
 * terminals negotiate down to, the other models what xterm itself renders.
 */
export const ANSI_16_RGB: readonly RGB[] = [
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

/** Colour name → {@link ANSI_16_RGB} index. */
export const ANSI_COLOR_INDEX: Record<string, number> = {
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

/**
 * Parse a CSS-ish colour into RGB channels plus a compositing alpha (0..1).
 * Extends {@link parseRgb} with `rgba(r,g,b,a)`, 8-digit hex (`#rrggbbaa`), and
 * the basic colour names. Returns `null` for `default`/`transparent`/unknown —
 * callers treat those as "no concrete colour to blend".
 */
export function parseColor(color: string): { rgb: RGB; alpha: number } | null {
  const norm = color.trim().toLowerCase();
  if (norm === "" || norm === "default" || norm === "transparent") return null;

  const rgba = norm.match(/^rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(-?[\d.]+)\s*\)$/);
  if (rgba) {
    return {
      rgb: { r: +rgba[1], g: +rgba[2], b: +rgba[3] },
      alpha: Math.max(0, Math.min(1, +rgba[4])),
    };
  }

  if (norm.startsWith("#") && norm.length === 9) {
    const hex = norm.slice(1);
    return {
      rgb: {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
      },
      alpha: Number.parseInt(hex.slice(6, 8), 16) / 255,
    };
  }

  const rgb = parseRgb(norm);
  if (rgb) return { rgb, alpha: 1 };
  if (NAMED_RGB[norm]) return { rgb: NAMED_RGB[norm], alpha: 1 };
  return null;
}
