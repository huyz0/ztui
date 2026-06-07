import { Resvg } from "@resvg/resvg-js";

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
 * Rasterizes an SVG string using @resvg/resvg-js at a target resolution of 16x16 pixels
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

  // Render at 4x the target size for high-quality super-sampling
  const superWidth = targetWidth * 4;
  const superHeight = targetHeight * 4;
  const superVisualSize = visualSize * 4;
  const superDx = dx * 4;
  const superDy = dy * 4;

  const wrappedSvg = `<svg width="${superWidth}" height="${superHeight}" viewBox="0 0 ${superWidth} ${superHeight}" xmlns="http://www.w3.org/2000/svg" color="${color}">
    <svg x="${superDx}" y="${superDy}" width="${superVisualSize}" height="${superVisualSize}">
      ${cleanedSvg}
    </svg>
  </svg>`;

  const resvg = new Resvg(wrappedSvg, {
    fitTo: {
      mode: "width",
      value: superWidth,
    },
  });
  const rendered = resvg.render();

  // Downsample the 4x rendered pixels to 1x using high-quality box filter (alpha-weighted)
  const downsampledPixels = new Uint8Array(targetWidth * targetHeight * 4);
  const srcPixels = rendered.pixels;

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;

      const sxMin = x * 4;
      const syMin = y * 4;

      for (let offsety = 0; offsety < 4; offsety++) {
        const sy = syMin + offsety;
        if (sy >= superHeight) continue;

        for (let offsetx = 0; offsetx < 4; offsetx++) {
          const sx = sxMin + offsetx;
          if (sx >= superWidth) continue;

          const srcIdx = (sy * superWidth + sx) * 4;
          const a = srcPixels[srcIdx + 3];

          rSum += srcPixels[srcIdx] * a;
          gSum += srcPixels[srcIdx + 1] * a;
          bSum += srcPixels[srcIdx + 2] * a;
          aSum += a;
        }
      }

      const dstIdx = (y * targetWidth + x) * 4;
      if (aSum > 0) {
        downsampledPixels[dstIdx] = Math.round(rSum / aSum);
        downsampledPixels[dstIdx + 1] = Math.round(gSum / aSum);
        downsampledPixels[dstIdx + 2] = Math.round(bSum / aSum);
        downsampledPixels[dstIdx + 3] = Math.round(aSum / 16);
      } else {
        downsampledPixels[dstIdx] = 0;
        downsampledPixels[dstIdx + 1] = 0;
        downsampledPixels[dstIdx + 2] = 0;
        downsampledPixels[dstIdx + 3] = 0;
      }
    }
  }

  return {
    pngBase64: rendered.asPng().toString("base64"),
    pixels: downsampledPixels,
    width: targetWidth,
    height: targetHeight,
    superWidth,
    superHeight,
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
export function rgbaToSixel(
  rgba: Uint8Array,
  width: number,
  height: number,
  color?: string,
  bgColor?: string,
): string {
  const fgRgb = parseColorToRGB(color || "white");
  const bgRgb = parseColorToRGB(bgColor || "#1e1e2e");

  // Define 16 color registers: #0 (background) through #15 (foreground)
  let colorDefinitions = "";
  for (let i = 0; i <= 15; i++) {
    const weight = i / 15;
    const r = bgRgb.r * (1 - weight) + fgRgb.r * weight;
    const g = bgRgb.g * (1 - weight) + fgRgb.g * weight;
    const b = bgRgb.b * (1 - weight) + fgRgb.b * weight;

    const rPct = Math.round((r / 255) * 100);
    const gPct = Math.round((g / 255) * 100);
    const bPct = Math.round((b / 255) * 100);

    colorDefinitions += `#${i};2;${rPct};${gPct};${bPct}`;
  }

  let sixel = `\x1bPq"1;1;${width};${height}${colorDefinitions}`;

  for (let y = 0; y < height; y += 6) {
    const passes: string[] = [];

    for (let c = 0; c <= 15; c++) {
      let valStr = "";
      let hasBits = false;

      for (let x = 0; x < width; x++) {
        let val = 0;
        for (let bit = 0; bit < 6; bit++) {
          const py = y + bit;
          let pixelIdx = 0; // Default to background
          if (py < height) {
            const idx = (py * width + x) * 4;
            const alpha = rgba[idx + 3];
            pixelIdx = Math.round((alpha / 255) * 15);
          } else {
            pixelIdx = 0;
          }

          if (pixelIdx === c) {
            val |= 1 << bit;
          }
        }

        if (val > 0) {
          hasBits = true;
        }
        valStr += String.fromCharCode(63 + val);
      }

      if (hasBits) {
        passes.push(`#${c}${valStr}`);
      }
    }

    sixel += passes.join("$");
    sixel += "-";
  }

  sixel += "\x1b\\";
  return sixel;
}
