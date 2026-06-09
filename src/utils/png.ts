import { PNG } from "pngjs";

/**
 * Encode raw RGBA pixels to a base64 PNG. Backend-agnostic: used by both the
 * terminal graphics protocols and (eventually) a web/canvas backend, so it
 * lives in utils rather than under a specific driver.
 */
export function encodePNG(pixelBuffer: Uint8Array, width: number, height: number): string {
  const png = new PNG({ width, height });
  png.data = Buffer.from(pixelBuffer.buffer, pixelBuffer.byteOffset, pixelBuffer.byteLength);
  const pngBuffer = PNG.sync.write(png);
  return pngBuffer.toString("base64");
}
