import {
  type RasterizedIcon,
  iconRegistry,
  rasterizeSVG,
  rgbaToSixel,
} from "../../widgets/icon-registry.ts";
import type { TerminalCapabilities } from "../driver.ts";

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
}
