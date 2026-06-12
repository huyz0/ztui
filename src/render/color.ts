/** Small RGB helpers shared by colour-driven widgets (progress, spinners). */

export type RGB = { r: number; g: number; b: number };

export const BLACK: RGB = { r: 0, g: 0, b: 0 };

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
