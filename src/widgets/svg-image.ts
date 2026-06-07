import * as fs from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { App } from "../core/app.ts";
import { Widget } from "../dom/widget.ts";
import { encodePNG } from "../driver/bun/graphics.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { Style } from "../render/style.ts";
import { parseColorToRGB } from "./icon-registry.ts";
import { renderAnsiFallback, resizeImage } from "./image-renderers.ts";

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
    const bgRgb = parseColorToRGB(bgHex === "default" ? "#1e1e2e" : bgHex);
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

    if (isGraphicsSupported) {
      // 1. Graphics Protocol mode
      const pixelWidth = client.width * cellSize.width;
      const pixelHeight = client.height * cellSize.height;

      const isCacheValid =
        this.cachedPixels !== null &&
        this.lastPixelWidth === pixelWidth &&
        this.lastPixelHeight === pixelHeight &&
        this.lastBgHex === bgHex &&
        this.lastSrc === (this.src || "");

      let renderedPixels: Uint8Array;
      let pngBase64: string;

      if (isCacheValid) {
        renderedPixels = this.cachedPixels!;
        pngBase64 = this.cachedPngBase64;
      } else {
        let rawPixels: any;
        try {
          const resvg = new Resvg(svgContent, {
            fitTo: {
              mode: "width",
              value: pixelWidth,
            },
          });
          const rendered = resvg.render();
          rawPixels = new Uint8Array(
            rendered.pixels.buffer,
            rendered.pixels.byteOffset,
            rendered.pixels.byteLength,
          );
          if (rendered.width !== pixelWidth || rendered.height !== pixelHeight) {
            rawPixels = resizeImage(
              rawPixels,
              rendered.width,
              rendered.height,
              pixelWidth,
              pixelHeight,
            );
          }
          renderedPixels = rawPixels;
        } catch (err) {
          this.renderError(
            buffer,
            `Render error: ${err instanceof Error ? err.message : String(err)}`,
            style,
          );
          return;
        }

        // Blend transparency with background
        for (let i = 0; i < renderedPixels.length; i += 4) {
          const alpha = renderedPixels[i + 3] / 255;
          renderedPixels[i] = Math.round(renderedPixels[i] * alpha + bgRgb.r * (1 - alpha));
          renderedPixels[i + 1] = Math.round(renderedPixels[i + 1] * alpha + bgRgb.g * (1 - alpha));
          renderedPixels[i + 2] = Math.round(renderedPixels[i + 2] * alpha + bgRgb.b * (1 - alpha));
          renderedPixels[i + 3] = 255;
        }

        pngBase64 = encodePNG(renderedPixels, pixelWidth, pixelHeight);

        // Update cache
        this.cachedPixels = renderedPixels;
        this.cachedPngBase64 = pngBase64;
        this.lastPixelWidth = pixelWidth;
        this.lastPixelHeight = pixelHeight;
        this.lastBgHex = bgHex;
        this.lastSrc = this.src || "";
      }

      buffer.cells[client.y][client.x] = {
        char: " ",
        style,
        wideContinuation: false,
        graphic: {
          type: "image",
          pixelBuffer: renderedPixels,
          pixelWidth,
          pixelHeight,
          cellWidth: client.width,
          cellHeight: client.height,
          pngBase64,
        },
      };

      // Mark other cells as wideContinuation so they are skipped by the terminal text renderer
      for (let dy = 0; dy < client.height; dy++) {
        for (let dx = 0; dx < client.width; dx++) {
          if (dy === 0 && dx === 0) continue;
          buffer.cells[client.y + dy][client.x + dx] = {
            char: "",
            style,
            wideContinuation: true,
          };
        }
      }
    } else {
      // 2. ANSI Fallback mode using dynamic character selection
      const cellW = cellSize?.width || 10;
      const cellH = cellSize?.height || 20;
      const pixelWidth = client.width * cellW;
      const pixelHeight = client.height * cellH;

      let renderedPixels: any;
      try {
        const resvg = new Resvg(svgContent, {
          fitTo: {
            mode: "width",
            value: pixelWidth,
          },
        });
        const rendered = resvg.render();
        let rawPixels: any = new Uint8Array(
          rendered.pixels.buffer,
          rendered.pixels.byteOffset,
          rendered.pixels.byteLength,
        );
        if (rendered.width !== pixelWidth || rendered.height !== pixelHeight) {
          rawPixels = resizeImage(
            rawPixels,
            rendered.width,
            rendered.height,
            pixelWidth,
            pixelHeight,
          );
        }
        renderedPixels = rawPixels;
      } catch (err) {
        this.renderError(
          buffer,
          `Render error: ${err instanceof Error ? err.message : String(err)}`,
          style,
        );
        return;
      }

      renderAnsiFallback(buffer, renderedPixels, pixelWidth, pixelHeight, client, bgRgb, bgHex);
    }
  }

  private renderError(buffer: ScreenBuffer, msg: string, style: Style): void {
    const client = this.getClientRect();
    let charsWritten = 0;
    for (let dy = 0; dy < client.height; dy++) {
      for (let dx = 0; dx < client.width; dx++) {
        const char = " ";
        if (dy === 0 && charsWritten < msg.length) {
          const remainingWidth = client.width - dx;
          const chunk = msg.substring(charsWritten, charsWritten + remainingWidth);
          for (let i = 0; i < chunk.length; i++) {
            buffer.cells[client.y + dy][client.x + dx + i] = {
              char: chunk[i],
              style,
              wideContinuation: false,
            };
          }
          charsWritten += chunk.length;
          dx += chunk.length - 1;
          continue;
        }
        buffer.cells[client.y + dy][client.x + dx] = {
          char,
          style,
          wideContinuation: false,
        };
      }
    }
  }
}
