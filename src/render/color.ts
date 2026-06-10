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
