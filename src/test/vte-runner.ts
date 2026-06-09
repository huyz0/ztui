import { Terminal } from "@xterm/headless";
import { rgbaToSixel } from "../driver/bun/graphics.ts";
import { type Clipboard, Driver, type TerminalCapabilities } from "../driver/driver.ts";
import { Size } from "../geometry/size.ts";
import { iconRegistry, type RasterizedIcon, rasterizeSVG } from "../render/icon-registry.ts";

export class VTEDriver extends Driver {
  public readonly capabilities: TerminalCapabilities;
  public readonly terminal: Terminal;
  public writtenData = "";
  private width: number;
  private height: number;
  private mockClipboardText = "";
  private iconCache = new Map<
    string,
    {
      raster?: RasterizedIcon;
      sixelCache?: Map<string, string>;
    }
  >();

  constructor(width = 80, height = 24, capabilities?: Partial<TerminalCapabilities>) {
    super();
    this.width = width;
    this.height = height;
    this.terminal = new Terminal({
      cols: width,
      rows: height,
      allowProposedApi: true,
    });
    this.capabilities = {
      truecolor: true,
      color256: true,
      kittyKeyboard: true,
      mouseTracking: true,
      mouseHover: true,
      hyperlinks: true,
      synchronizedUpdates: true,
      glyphProtocol: true,
      clipboard: true,
      notifications: true,
      graphicsProtocol: "kitty",
      cellSize: { width: 8, height: 16 },
      ...capabilities,
    };
  }

  public readonly clipboard: Clipboard = {
    get: async () => this.mockClipboardText,
    set: (text: string) => {
      this.mockClipboardText = text;
      this.write(`\x1b]52;c;${Buffer.from(text).toString("base64")}\x07`);
    },
  };

  public getSize(): Size {
    return new Size(this.width, this.height);
  }

  public start(): void {
    // Emit capabilities_resolved immediately since there is no async probing in mock VTE
    this.capabilitiesResolved = true;
    this.emit("capabilities_resolved");
  }
  public stop(): void {}

  public write(data: string): void {
    this.writtenData += data;
    this.terminal.write(data);
  }

  public showNotification(title: string, body: string): void {
    this.write(`\x1b]9;${title}: ${body}\x07`);
    this.write(`\x1b]777;notify;${title};${body}\x07`);
  }

  public writeAsync(data: string): Promise<void> {
    return new Promise<void>((resolve) => {
      this.writtenData += data;
      this.terminal.write(data, resolve);
    });
  }

  public waitWrite(): Promise<void> {
    return new Promise<void>((resolve) => {
      // Small timeout to let any scheduled xterm writes flush
      setTimeout(resolve, 10);
    });
  }

  // Simulator helper methods
  public simulateKey(key: string, name = key, ctrl = false, shift = false, meta = false): void {
    this.emit("key", { key, name, ctrl, shift, meta });
  }

  public simulateMouse(x: number, y: number, type: any, button: any): void {
    this.emit("mouse", { x, y, type, button });
  }

  private getOrRasterize(name: string, svg: string, color: string): RasterizedIcon {
    const cacheKey = `${name}_${color}`;
    let cache = this.iconCache.get(cacheKey);
    if (!cache) {
      cache = {};
      this.iconCache.set(cacheKey, cache);
    }
    if (!cache.raster) {
      const cellWidth = this.capabilities.cellSize?.width || 8;
      const cellHeight = this.capabilities.cellSize?.height || 16;
      cache.raster = rasterizeSVG(svg, cellWidth * 2, cellHeight, color);
    }
    return cache.raster;
  }

  public override getIconSequence(name: string, color?: string, bgColor?: string): string {
    const icon = iconRegistry.get(name);
    if (!icon) return "";

    const fgColor = color && color !== "default" ? color : "white";

    if (this.capabilities.graphicsProtocol === "kitty") {
      const raster = this.getOrRasterize(name, icon.svg, fgColor);
      const w = raster.superWidth !== undefined ? raster.superWidth : raster.width;
      const h = raster.superHeight !== undefined ? raster.superHeight : raster.height;
      return `\x1b[s\x1b_Gf=100,a=T,t=d,s=${w},v=${h},c=2,r=1;${raster.pngBase64}\x1b\\\x1b[u`;
    }

    if (this.capabilities.graphicsProtocol === "iterm2") {
      const raster = this.getOrRasterize(name, icon.svg, fgColor);
      return `\x1b[s\x1b]1337;File=inline=1;width=2;height=1:${raster.pngBase64}\x07\x1b[u`;
    }

    if (this.capabilities.graphicsProtocol === "sixel") {
      const raster = this.getOrRasterize(name, icon.svg, fgColor);
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
      return `\x1b[s${sixel}\x1b[u`;
    }

    if (this.capabilities.glyphProtocol) {
      const codepoint = iconRegistry.getCodepoint(name);
      return codepoint ? String.fromCodePoint(codepoint) : icon.textFallback;
    }

    return icon.textFallback;
  }
}
