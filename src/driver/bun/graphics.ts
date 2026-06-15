import {
  iconRegistry,
  parseColorToRGB,
  type RasterizedIcon,
  rasterizeSVG,
} from "../../render/icon-registry.ts";
import { encodePNG } from "../../utils/png.ts";
import type { TerminalCapabilities } from "../driver.ts";

export { encodePNG };

export class TerminalGraphicsManager {
  private iconCache = new Map<
    string,
    {
      raster?: RasterizedIcon;
      cellWidth?: number;
      cellHeight?: number;
      sixelCache?: Map<string, string>;
    }
  >();
  // Cached background-fill clear sequences, keyed by cell size + bg colour.
  private clearCache = new Map<string, string>();

  private getOrRasterize(
    name: string,
    svg: string,
    color: string,
    capabilities: TerminalCapabilities,
  ): RasterizedIcon {
    const isWT = !!process.env.WT_SESSION || !!process.env.WT_PROFILE_ID;
    const cellWidth = capabilities.cellSize?.width || (isWT ? 11 : 10);
    const cellHeight = capabilities.cellSize?.height || (isWT ? 22 : 20);

    const cacheKey = `${name}_${color}`;
    const cache = this.iconCache.get(cacheKey);
    if (cache?.raster && cache.cellWidth === cellWidth && cache.cellHeight === cellHeight) {
      return cache.raster;
    }

    const raster = rasterizeSVG(svg, cellWidth * 2, cellHeight, color);
    this.iconCache.set(cacheKey, {
      raster,
      cellWidth,
      cellHeight,
      sixelCache: new Map(),
    });
    return raster;
  }

  /**
   * Sequence that erases a previously-drawn icon/graphic at the cursor cell.
   * Text/spaces don't clear an image from a terminal's graphics layer, so on
   * sixel we paint an opaque background rectangle over the 2×1 cell footprint
   * (reusing the tested encoder with a transparent buffer → register 0 = bg);
   * on kitty we delete the placement. Returns "" when no clear is needed.
   */
  public getIconClearSequence(capabilities: TerminalCapabilities, bgColor?: string): string {
    if (capabilities.graphicsProtocol === "kitty") {
      return "\x1b_Ga=d,d=c\x1b\\";
    }
    if (capabilities.graphicsProtocol === "sixel") {
      const isWT = !!process.env.WT_SESSION || !!process.env.WT_PROFILE_ID;
      const cellWidth = capabilities.cellSize?.width || (isWT ? 11 : 10);
      const cellHeight = capabilities.cellSize?.height || (isWT ? 22 : 20);
      const w = cellWidth * 2;
      const h = cellHeight;
      const bg = bgColor && bgColor !== "default" ? bgColor : "#1e1e2e";
      const key = `clear_${w}x${h}_${bg}`;
      let seq = this.clearCache.get(key);
      if (!seq) {
        const sixel = rgbaToSixel(new Uint8Array(w * h * 4), w, h, "white", bg);
        seq = `\x1b[s${sixel}\x1b[u`;
        this.clearCache.set(key, seq);
      }
      return seq;
    }
    return "";
  }

  public getIconSequence(
    name: string,
    capabilities: TerminalCapabilities,
    color?: string,
    bgColor?: string,
  ): string {
    const icon = iconRegistry.get(name);
    if (!icon) return "";

    const fgColor = color && color !== "default" ? color : "white";

    if (capabilities.graphicsProtocol === "kitty") {
      const raster = this.getOrRasterize(name, icon.svg, fgColor, capabilities);
      const w = raster.superWidth !== undefined ? raster.superWidth : raster.width;
      const h = raster.superHeight !== undefined ? raster.superHeight : raster.height;
      const rawSeq = `\x1b[s\x1b_Gf=100,a=T,t=d,s=${w},v=${h},c=2,r=1;${raster.pngBase64}\x1b\\\x1b[u`;
      return `\x1b[s  \x1b[u${rawSeq}\x1b[2C`;
    }

    if (capabilities.graphicsProtocol === "iterm2") {
      const raster = this.getOrRasterize(name, icon.svg, fgColor, capabilities);
      const rawSeq = `\x1b[s\x1b]1337;File=inline=1;width=2;height=1:${raster.pngBase64}\x07\x1b[u`;
      return `\x1b[s  \x1b[u${rawSeq}\x1b[2C`;
    }

    if (capabilities.graphicsProtocol === "sixel") {
      const raster = this.getOrRasterize(name, icon.svg, fgColor, capabilities);
      const bgClr = bgColor && bgColor !== "default" ? bgColor : "#1e1e2e";
      const cacheKey = `${fgColor}_${bgClr}`;

      const cacheKeyWithColor = `${name}_${fgColor}`;
      let cache = this.iconCache.get(cacheKeyWithColor);
      if (!cache) {
        cache = { raster };
        this.iconCache.set(cacheKeyWithColor, cache);
      }
      if (!cache.sixelCache) {
        cache.sixelCache = new Map();
      }
      let sixel = cache.sixelCache.get(cacheKey);
      if (!sixel) {
        sixel = rgbaToSixel(raster.pixels, raster.width, raster.height, fgColor, bgClr);
        cache.sixelCache.set(cacheKey, sixel);
      }
      const rawSeq = `\x1b[s${sixel}\x1b[u`;
      return `\x1b[s  \x1b[u${rawSeq}\x1b[2C`;
    }

    if (capabilities.glyphProtocol) {
      const codepoint = iconRegistry.getCodepoint(name);
      return codepoint ? String.fromCodePoint(codepoint) : icon.textFallback;
    }

    return icon.textFallback;
  }

  public getImageSequence(
    pixelBuffer: Uint8Array,
    pixelWidth: number,
    pixelHeight: number,
    cellWidth: number,
    cellHeight: number,
    capabilities: TerminalCapabilities,
    pngBase64?: string,
    bgColor?: string,
    zIndex?: number,
  ): string {
    if (capabilities.graphicsProtocol === "kitty") {
      const base64 = pngBase64 || encodePNG(pixelBuffer, pixelWidth, pixelHeight);
      // z >= 0 draws the image *above* text (Kitty's rule), matching icons. A
      // behind-text image (z<0) bleeds stale text through it and is hidden by any
      // opaque cell background, so default to z=0 (in front) and honor an
      // explicit zIndex for deliberate layering.
      const zValue = zIndex ?? 0;
      return `\x1b_Gf=100,a=T,t=d,s=${pixelWidth},v=${pixelHeight},c=${cellWidth},r=${cellHeight},z=${zValue};${base64}\x1b\\`;
    }

    if (capabilities.graphicsProtocol === "iterm2") {
      const base64 = pngBase64 || encodePNG(pixelBuffer, pixelWidth, pixelHeight);
      return `\x1b]1337;File=inline=1;width=${cellWidth};height=${cellHeight}:${base64}\x07`;
    }

    if (capabilities.graphicsProtocol === "sixel") {
      return fullColorRgbaToSixel(pixelBuffer, pixelWidth, pixelHeight, bgColor);
    }

    return "";
  }
}

/**
 * Encode RGBA pixels to a 16-register Sixel string (foreground gradient over a
 * background). Sixel is a terminal graphics protocol, so this encoder lives in
 * the driver layer rather than in the widget layer.
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

export function fullColorRgbaToSixel(
  rgba: Uint8Array,
  width: number,
  height: number,
  bgColor?: string,
): string {
  const bgRgb = parseColorToRGB(bgColor || "#1e1e2e");

  const rLevels = [0, 36, 72, 109, 145, 182, 218, 255];
  const gLevels = [0, 36, 72, 109, 145, 182, 218, 255];
  const bLevels = [0, 85, 170, 255];

  let colorDefinitions = "";
  for (let r = 0; r < 8; r++) {
    for (let g = 0; g < 8; g++) {
      for (let b = 0; b < 4; b++) {
        const colorId = (r << 5) | (g << 2) | b;
        const rVal = rLevels[r];
        const gVal = gLevels[g];
        const bVal = bLevels[b];
        const rPct = Math.round((rVal / 255) * 100);
        const gPct = Math.round((gVal / 255) * 100);
        const bPct = Math.round((bVal / 255) * 100);
        colorDefinitions += `#${colorId};2;${rPct};${gPct};${bPct}`;
      }
    }
  }

  let sixel = `\x1bPq"1;1;${width};${height}${colorDefinitions}`;

  for (let y = 0; y < height; y += 6) {
    const colorPasses = new Map<number, Uint8Array>();

    for (let bit = 0; bit < 6; bit++) {
      const py = y + bit;
      if (py >= height) break;

      for (let x = 0; x < width; x++) {
        const idx = (py * width + x) * 4;
        const alpha = rgba[idx + 3] / 255;
        const r = Math.round(rgba[idx] * alpha + bgRgb.r * (1 - alpha));
        const g = Math.round(rgba[idx + 1] * alpha + bgRgb.g * (1 - alpha));
        const b = Math.round(rgba[idx + 2] * alpha + bgRgb.b * (1 - alpha));

        const rIdx = Math.min(7, Math.floor((r + 18) / 36));
        const gIdx = Math.min(7, Math.floor((g + 18) / 36));
        const bIdx = Math.min(3, Math.floor((b + 42) / 85));

        const colorId = (rIdx << 5) | (gIdx << 2) | bIdx;

        let passData = colorPasses.get(colorId);
        if (!passData) {
          passData = new Uint8Array(width);
          colorPasses.set(colorId, passData);
        }
        passData[x] |= 1 << bit;
      }
    }

    const passes: string[] = [];
    for (const [colorId, passData] of colorPasses.entries()) {
      let rightBound = width;
      while (rightBound > 0 && passData[rightBound - 1] === 0) {
        rightBound--;
      }
      if (rightBound > 0) {
        let cleanRun = "";
        let val = -1;
        let cnt = 0;
        const flushCleanRun = () => {
          if (cnt > 0) {
            const char = String.fromCharCode(63 + val);
            if (cnt >= 4) {
              cleanRun += `!${cnt}${char}`;
            } else {
              cleanRun += char.repeat(cnt);
            }
          }
        };
        for (let x = 0; x < rightBound; x++) {
          const v = passData[x];
          if (v === val) {
            cnt++;
          } else {
            flushCleanRun();
            val = v;
            cnt = 1;
          }
        }
        flushCleanRun();
        passes.push(`#${colorId}${cleanRun}`);
      }
    }

    sixel += passes.join("$");
    sixel += "-";
  }

  sixel += "\x1b\\";
  return sixel;
}
