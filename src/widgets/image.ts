import * as fs from "node:fs";
import jpeg from "jpeg-js";
import { GifReader } from "omggif";
import { PNG } from "pngjs";
import { App } from "../core/app.ts";
import { Widget } from "../dom/widget.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { Style } from "../render/style.ts";
import { parseColorToRGB } from "./icon-registry.ts";

export class ImageWidget extends Widget {
  public src?: string;
  public buffer?: Uint8Array;

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
      this.renderError(
        buffer,
        `Decode error: ${err instanceof Error ? err.message : String(err)}`,
        style,
      );
      return;
    }

    const app = App.instance;
    const capabilities = app?.driver.capabilities;
    const isGraphicsSupported = capabilities && capabilities.graphicsProtocol !== "none";

    const cellSize = capabilities?.cellSize || { width: 10, height: 20 };

    if (isGraphicsSupported) {
      // 1. Graphics Protocol mode
      const pixelWidth = client.width * cellSize.width;
      const pixelHeight = client.height * cellSize.height;

      const scaledPixels = resizeImage(
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
      // 2. ANSI Half-Block Fallback mode
      const pixelWidth = client.width;
      const pixelHeight = client.height * 2;

      const scaledPixels = resizeImage(
        decoded.pixels,
        decoded.width,
        decoded.height,
        pixelWidth,
        pixelHeight,
      );

      // Blend transparency with background color
      for (let i = 0; i < scaledPixels.length; i += 4) {
        const alpha = scaledPixels[i + 3] / 255;
        scaledPixels[i] = Math.round(scaledPixels[i] * alpha + bgRgb.r * (1 - alpha));
        scaledPixels[i + 1] = Math.round(scaledPixels[i + 1] * alpha + bgRgb.g * (1 - alpha));
        scaledPixels[i + 2] = Math.round(scaledPixels[i + 2] * alpha + bgRgb.b * (1 - alpha));
        scaledPixels[i + 3] = 255;
      }

      for (let dy = 0; dy < client.height; dy++) {
        for (let dx = 0; dx < client.width; dx++) {
          const topIdx = (dy * 2 * pixelWidth + dx) * 4;
          const botIdx = ((dy * 2 + 1) * pixelWidth + dx) * 4;

          const topHex = rgbToHex(
            scaledPixels[topIdx],
            scaledPixels[topIdx + 1],
            scaledPixels[topIdx + 2],
          );
          const botHex = rgbToHex(
            scaledPixels[botIdx],
            scaledPixels[botIdx + 1],
            scaledPixels[botIdx + 2],
          );

          const cellStyle = new Style({
            color: topHex,
            background: botHex,
          });

          buffer.cells[client.y + dy][client.x + dx] = {
            char: "▀",
            style: cellStyle,
            wideContinuation: false,
          };
        }
      }
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
  } catch (err) {
    throw new Error("Unsupported or invalid image format. Must be PNG, JPEG, or GIF.");
  }
}

export function resizeImage(
  srcPixels: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): Uint8Array {
  const dstPixels = new Uint8Array(dstWidth * dstHeight * 4);
  const xRatio = srcWidth / dstWidth;
  const yRatio = srcHeight / dstHeight;

  for (let y = 0; y < dstHeight; y++) {
    for (let x = 0; x < dstWidth; x++) {
      const px = x * xRatio;
      const py = y * yRatio;
      const xL = Math.floor(px);
      const xH = Math.min(srcWidth - 1, Math.ceil(px));
      const yL = Math.floor(py);
      const yH = Math.min(srcHeight - 1, Math.ceil(py));

      const xWeight = px - xL;
      const yWeight = py - yL;

      const idxLL = (yL * srcWidth + xL) * 4;
      const idxLH = (yL * srcWidth + xH) * 4;
      const idxHL = (yH * srcWidth + xL) * 4;
      const idxHH = (yH * srcWidth + xH) * 4;

      const dstIdx = (y * dstWidth + x) * 4;

      for (let c = 0; c < 4; c++) {
        const valLL = srcPixels[idxLL + c];
        const valLH = srcPixels[idxLH + c];
        const valHL = srcPixels[idxHL + c];
        const valHH = srcPixels[idxHH + c];

        const top = valLL * (1 - xWeight) + valLH * xWeight;
        const bottom = valHL * (1 - xWeight) + valHH * xWeight;
        dstPixels[dstIdx + c] = Math.round(top * (1 - yWeight) + bottom * yWeight);
      }
    }
  }
  return dstPixels;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number) => c.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
