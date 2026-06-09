import { renderSvgSync } from "../utils/sharp-sync.ts";

export interface IconDefinition {
  name: string;
  svg: string; // Raw SVG string
  textFallback: string; // Unicode emoji or string fallback
}

export interface RasterizedIcon {
  pngBase64: string;
  pixels: Uint8Array;
  width: number;
  height: number;
  superWidth: number;
  superHeight: number;
}

export class IconRegistry {
  private icons = new Map<string, IconDefinition>();
  private codepoints = new Map<string, number>();
  private nextCodepoint = 0xe000;

  public registerIcon(icon: IconDefinition): void {
    this.icons.set(icon.name, icon);
    if (!this.codepoints.has(icon.name)) {
      this.codepoints.set(icon.name, this.nextCodepoint++);
    }
  }

  public registerIcons(icons: IconDefinition[]): void {
    for (const icon of icons) {
      this.registerIcon(icon);
    }
  }

  public get(name: string): IconDefinition | undefined {
    return this.icons.get(name);
  }

  public getAll(): IconDefinition[] {
    return Array.from(this.icons.values());
  }

  public getCodepoint(name: string): number | undefined {
    return this.codepoints.get(name);
  }
}

export const iconRegistry = new IconRegistry();

function cleanSvg(svg: string): string {
  const match = svg.match(/<svg[^>]*>/);
  if (match) {
    let openingTag = match[0];
    openingTag = openingTag.replace(/\s+width\s*=\s*"[^"]*"/gi, "");
    openingTag = openingTag.replace(/\s+height\s*=\s*"[^"]*"/gi, "");
    openingTag = openingTag.replace(/\s+width\s*=\s*'[^']*'/gi, "");
    openingTag = openingTag.replace(/\s+height\s*=\s*'[^']*'/gi, "");
    return svg.replace(match[0], openingTag);
  }
  return svg;
}

/**
 * Rasterizes an SVG string using sharp at a target resolution of 16x16 pixels
 * to fit double-width (2x1 cells) terminal grids.
 */
export function rasterizeSVG(
  svg: string,
  targetWidth = 16,
  targetHeight = 16,
  color = "white",
): RasterizedIcon {
  const cleanedSvg = cleanSvg(svg);
  const iconSize = Math.min(targetWidth, targetHeight);

  // Parse original design size from the viewBox to scale down mini (20x20) and micro (16x16) relative to solid (24x24)
  let originalSize = 24;
  const viewBoxMatch = svg.match(/viewBox\s*=\s*["']\s*\d+\s+\d+\s+(\d+)\s+(\d+)\s*["']/i);
  if (viewBoxMatch) {
    const w = Number.parseInt(viewBoxMatch[1], 10);
    const h = Number.parseInt(viewBoxMatch[2], 10);
    originalSize = Math.max(w, h) || 24;
  }

  const scale = Math.min(1.0, originalSize / 24);
  const visualSize = Math.round(iconSize * scale);
  const dx = Math.floor((targetWidth - visualSize) / 2);
  const dy = Math.floor((targetHeight - visualSize) / 2);

  const wrappedSvg = `<svg width="${targetWidth}" height="${targetHeight}" viewBox="0 0 ${targetWidth} ${targetHeight}" xmlns="http://www.w3.org/2000/svg" color="${color}">
    <svg x="${dx}" y="${dy}" width="${visualSize}" height="${visualSize}">
      ${cleanedSvg}
    </svg>
  </svg>`;

  const rendered = renderSvgSync({
    svg: wrappedSvg,
    width: targetWidth,
    height: targetHeight,
    isIcon: true,
    color,
  });

  return {
    pngBase64: rendered.pngBase64,
    pixels: rendered.pixels,
    width: rendered.width,
    height: rendered.height,
    superWidth: rendered.width,
    superHeight: rendered.height,
  };
}

/**
 * Maps a style color string (hex, rgb, or basic name) to an { r, g, b } representation.
 */
export function parseColorToRGB(color: string): { r: number; g: number; b: number } {
  const norm = color.trim().toLowerCase();

  const basicColors: Record<string, { r: number; g: number; b: number }> = {
    black: { r: 0, g: 0, b: 0 },
    red: { r: 128, g: 0, b: 0 },
    green: { r: 0, g: 128, b: 0 },
    yellow: { r: 128, g: 128, b: 0 },
    blue: { r: 0, g: 0, b: 128 },
    magenta: { r: 128, g: 0, b: 128 },
    cyan: { r: 0, g: 128, b: 128 },
    white: { r: 192, g: 192, b: 192 },
    gray: { r: 128, g: 128, b: 128 },
    grey: { r: 128, g: 128, b: 128 },
    "bright-black": { r: 128, g: 128, b: 128 },
    "bright-red": { r: 255, g: 0, b: 0 },
    "bright-green": { r: 0, g: 255, b: 0 },
    "bright-yellow": { r: 255, g: 255, b: 0 },
    "bright-blue": { r: 0, g: 0, b: 255 },
    "bright-magenta": { r: 255, g: 0, b: 255 },
    "bright-cyan": { r: 0, g: 255, b: 255 },
    "bright-white": { r: 255, g: 255, b: 255 },
  };

  if (basicColors[norm]) {
    return basicColors[norm];
  }

  if (norm.startsWith("#")) {
    const hex = norm.slice(1);
    if (hex.length === 3) {
      const r = Number.parseInt(hex[0] + hex[0], 16);
      const g = Number.parseInt(hex[1] + hex[1], 16);
      const b = Number.parseInt(hex[2] + hex[2], 16);
      return { r, g, b };
    }
    if (hex.length === 6) {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      return { r, g, b };
    }
  }

  const rgbMatch = norm.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgbMatch) {
    const r = Number.parseInt(rgbMatch[1], 10);
    const g = Number.parseInt(rgbMatch[2], 10);
    const b = Number.parseInt(rgbMatch[3], 10);
    return { r, g, b };
  }

  return { r: 255, g: 255, b: 255 };
}

/**
 * Encodes raw RGBA pixels into a Sixel escape sequence, dynamically coloring the foreground.
 */
