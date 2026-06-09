import * as fs from "node:fs";
import jpeg from "jpeg-js";
import { GifReader } from "omggif";
import { PNG } from "pngjs";
import { App } from "../core/app.ts";
import { logger } from "../core/logger.ts";
import { Widget } from "../dom/widget.ts";
import { encodePNG } from "../driver/bun/graphics.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { Style } from "../render/style.ts";
import { parseColorToRGB } from "./icon-registry.ts";
import { renderAnsiFallback, resizeImage } from "./image-renderers.ts";

export class ImageWidget extends Widget {
  public src?: string;
  public buffer?: Uint8Array;
  public ansi = false;

  private lastPixelWidth = 0;
  private lastPixelHeight = 0;
  private lastBgHex = "";
  private lastSrc = "";
  private lastBuffer: Uint8Array | null = null;
  private cachedPngBase64 = "";
  private cachedPixels: Uint8Array | null = null;

  constructor() {
    super("image");
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

    let imageBuffer: Uint8Array | undefined;
    if (this.buffer) {
      imageBuffer = this.buffer;
    } else if (this.src) {
      try {
        if (this.src.startsWith("data:image/") && this.src.includes(";base64,")) {
          const base64Str = this.src.split(";base64,")[1];
          imageBuffer = new Uint8Array(Buffer.from(base64Str, "base64"));
        } else {
          imageBuffer = new Uint8Array(fs.readFileSync(this.src));
        }
      } catch (err) {
        logger.warn("image", `failed to read image source "${this.src}": ${this.describe()}`, err);
        this.renderError(
          buffer,
          `Error reading: ${err instanceof Error ? err.message : String(err)}`,
          style,
        );
        return;
      }
    }

    if (!imageBuffer) {
      this.renderError(buffer, "No image source provided", style);
      return;
    }

    let decoded: { pixels: Uint8Array; width: number; height: number };
    try {
      decoded = decodeImage(imageBuffer);
    } catch (err) {
      logger.warn("image", `failed to decode image: ${this.describe()}`, err);
      this.renderError(
        buffer,
        `Decode error: ${err instanceof Error ? err.message : String(err)}`,
        style,
      );
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
        this.lastSrc === (this.src || "") &&
        this.lastBuffer === (this.buffer || null);

      let scaledPixels: Uint8Array;
      let pngBase64: string;

      if (isCacheValid) {
        scaledPixels = this.cachedPixels!;
        pngBase64 = this.cachedPngBase64;
      } else {
        scaledPixels = resizeImage(
          decoded.pixels,
          decoded.width,
          decoded.height,
          pixelWidth,
          pixelHeight,
        );

        // Blend transparency with the background color
        for (let i = 0; i < scaledPixels.length; i += 4) {
          const alpha = scaledPixels[i + 3] / 255;
          scaledPixels[i] = Math.round(scaledPixels[i] * alpha + bgRgb.r * (1 - alpha));
          scaledPixels[i + 1] = Math.round(scaledPixels[i + 1] * alpha + bgRgb.g * (1 - alpha));
          scaledPixels[i + 2] = Math.round(scaledPixels[i + 2] * alpha + bgRgb.b * (1 - alpha));
          scaledPixels[i + 3] = 255;
        }

        pngBase64 = encodePNG(scaledPixels, pixelWidth, pixelHeight);

        // Cache the results
        this.cachedPixels = scaledPixels;
        this.cachedPngBase64 = pngBase64;
        this.lastPixelWidth = pixelWidth;
        this.lastPixelHeight = pixelHeight;
        this.lastBgHex = bgHex;
        this.lastSrc = this.src || "";
        this.lastBuffer = this.buffer || null;
      }

      buffer.cells[client.y][client.x] = {
        char: " ",
        style,
        wideContinuation: false,
        graphic: {
          type: "image",
          pixelBuffer: scaledPixels,
          pixelWidth,
          pixelHeight,
          cellWidth: client.width,
          cellHeight: client.height,
          pngBase64,
          zIndex: this.computedStyle.zIndex,
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
      renderAnsiFallback(
        buffer,
        decoded.pixels,
        decoded.width,
        decoded.height,
        client,
        bgRgb,
        bgHex,
      );
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
            buffer.cells[cy][cx + i] = {
              char: chunk[i],
              style,
              wideContinuation: false,
            };
          }
          charsWritten += chunk.length;
          dx += chunk.length - 1;
          continue;
        }
        buffer.cells[cy][cx] = {
          char: " ",
          style,
          wideContinuation: false,
        };
      }
    }
  }
}

export function decodeImage(buffer: Uint8Array): {
  pixels: Uint8Array;
  width: number;
  height: number;
} {
  // Check PNG magic bytes
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    const png = PNG.sync.read(Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength));
    return {
      pixels: new Uint8Array(png.data),
      width: png.width,
      height: png.height,
    };
  }

  // Check GIF magic bytes (GIF8)
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    const reader = new GifReader(Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength));
    const pixels = new Uint8Array(reader.width * reader.height * 4);
    reader.decodeAndBlitFrameRGBA(0, pixels);
    return {
      pixels,
      width: reader.width,
      height: reader.height,
    };
  }

  // Fallback to JPEG
  try {
    const raw = jpeg.decode(buffer, { useTArray: true });
    return {
      pixels: new Uint8Array(raw.data),
      width: raw.width,
      height: raw.height,
    };
  } catch (_err) {
    const magic = Array.from(buffer.subarray(0, 8))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    throw new Error(
      `Unsupported or invalid image format (must be PNG, JPEG, or GIF). ` +
        `Got ${buffer.length} bytes starting with: ${magic || "(empty)"}`,
    );
  }
}

export { resizeImage } from "./image-renderers.ts";
