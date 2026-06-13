import * as fs from "node:fs";
import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import type { Region } from "../../geometry/region.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { parseColorToRGB } from "../../render/icon-registry.ts";
import { Style } from "../../render/style.ts";
import { ThemeManager } from "../../theme.ts";
import { logger } from "../../utils/logger.ts";
import { renderSvgSync } from "../../utils/sharp-sync.ts";
import { renderAnsiFallback } from "./image-renderers.ts";

export class SvgImageWidget extends Widget {
  public src?: string;
  public ansi = false;

  private lastPixelWidth = 0;
  private lastPixelHeight = 0;
  private lastBgHex = "";
  private lastSrc = "";
  private cachedPngBase64 = "";
  private cachedPixels: Uint8Array | null = null;

  constructor() {
    super("svgimage");
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;

    super.render(buffer);
    const client = this.getClientRect();
    if (client.width <= 0 || client.height <= 0) return;

    const bgHex = this.findResolvedBackground();
    const bgRgb = parseColorToRGB(
      bgHex === "default" ? ThemeManager.getInstance().getActiveTheme().colors.background : bgHex,
    );
    const style = new Style({
      color: "default",
      background: bgHex,
    });

    let svgContent = "";
    if (this.src) {
      try {
        const trimmed = this.src.trim();
        if (trimmed.startsWith("<svg") || trimmed.startsWith("<?xml")) {
          svgContent = trimmed;
        } else {
          svgContent = fs.readFileSync(this.src, "utf8");
        }
      } catch (err) {
        logger.warn("svgimage", `failed to read SVG source "${this.src}": ${this.describe()}`, err);
        this.renderError(
          buffer,
          `Error reading SVG: ${err instanceof Error ? err.message : String(err)}`,
          style,
        );
        return;
      }
    }

    if (!svgContent) {
      this.renderError(buffer, "No SVG source provided", style);
      return;
    }

    const app = App.instance;
    const capabilities = app?.driver.capabilities;
    const isGraphicsSupported =
      capabilities && capabilities.graphicsProtocol !== "none" && !this.ansi;

    const cellSize = capabilities?.cellSize || { width: 10, height: 20 };

    const targetPixelWidth = isGraphicsSupported
      ? client.width * cellSize.width
      : client.width * (cellSize?.width || 10);
    const targetPixelHeight = isGraphicsSupported
      ? client.height * cellSize.height
      : client.height * (cellSize?.height || 20);

    const isCacheValid =
      this.cachedPixels !== null &&
      this.lastPixelWidth === targetPixelWidth &&
      this.lastPixelHeight === targetPixelHeight &&
      this.lastBgHex === bgHex &&
      this.lastSrc === (this.src || "");

    if (isCacheValid) {
      this.blit(buffer, client, style, targetPixelWidth, targetPixelHeight, isGraphicsSupported, {
        bgRgb,
        bgHex,
      });
      return;
    }

    try {
      const colorBg =
        bgHex === "default" ? ThemeManager.getInstance().getActiveTheme().colors.background : bgHex;
      const rendered = renderSvgSync({
        svg: svgContent,
        width: targetPixelWidth,
        height: targetPixelHeight,
        isIcon: false,
        bgHex: colorBg,
      });

      this.cachedPixels = rendered.pixels;
      this.cachedPngBase64 = rendered.pngBase64;
      this.lastPixelWidth = targetPixelWidth;
      this.lastPixelHeight = targetPixelHeight;
      this.lastBgHex = bgHex;
      this.lastSrc = this.src || "";

      this.blit(buffer, client, style, targetPixelWidth, targetPixelHeight, isGraphicsSupported, {
        bgRgb,
        bgHex,
      });
    } catch (err: any) {
      logger.warn("svgimage", `failed to rasterize SVG: ${this.describe()}`, err);
      this.renderError(buffer, `Render error: ${err.message}`, style);
    }
  }

  /**
   * Paint the cached rasterized pixels into the client rect: either as a single
   * graphic cell (with the rest of the rect marked as wide-continuation) when
   * the terminal supports an image protocol, or as an ANSI half-block fallback.
   */
  private blit(
    buffer: ScreenBuffer,
    client: Region,
    style: Style,
    pixelWidth: number,
    pixelHeight: number,
    graphics: boolean | undefined,
    bg: { bgRgb: { r: number; g: number; b: number }; bgHex: string },
  ): void {
    if (!graphics) {
      renderAnsiFallback(
        buffer,
        this.cachedPixels!,
        pixelWidth,
        pixelHeight,
        client,
        bg.bgRgb,
        bg.bgHex,
      );
      return;
    }
    buffer.cells[client.y][client.x] = {
      char: " ",
      style,
      wideContinuation: false,
      graphic: {
        type: "image",
        pixelBuffer: this.cachedPixels!,
        pixelWidth,
        pixelHeight,
        cellWidth: client.width,
        cellHeight: client.height,
        pngBase64: this.cachedPngBase64,
        zIndex: this.computedStyle.zIndex,
      },
    };
    for (let dy = 0; dy < client.height; dy++) {
      for (let dx = 0; dx < client.width; dx++) {
        if (dy === 0 && dx === 0) continue;
        buffer.cells[client.y + dy][client.x + dx] = { char: "", style, wideContinuation: true };
      }
    }
  }

  private renderError(buffer: ScreenBuffer, msg: string, style: Style): void {
    const client = this.getClientRect();
    let charsWritten = 0;
    for (let dy = 0; dy < client.height; dy++) {
      const cy = client.y + dy;
      if (cy < 0 || cy >= buffer.height) continue;
      for (let dx = 0; dx < client.width; dx++) {
        const cx = client.x + dx;
        if (cx < 0 || cx >= buffer.width) continue;
        if (dy === 0 && charsWritten < msg.length) {
          const remainingWidth = client.width - dx;
          const chunk = msg.substring(charsWritten, charsWritten + remainingWidth);
          for (let i = 0; i < chunk.length; i++) {
            if (cx + i >= buffer.width) break;
            buffer.cells[cy][cx + i] = { char: chunk[i], style, wideContinuation: false };
          }
          charsWritten += chunk.length;
          dx += chunk.length - 1;
          continue;
        }
        buffer.cells[cy][cx] = { char: " ", style, wideContinuation: false };
      }
    }
  }
}
