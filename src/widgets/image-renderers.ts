import type { ScreenBuffer } from "../render/buffer.ts";
import { Style } from "../render/style.ts";

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
      const px = Math.max(0, Math.min(srcWidth - 1, (x + 0.5) * xRatio - 0.5));
      const py = Math.max(0, Math.min(srcHeight - 1, (y + 0.5) * yRatio - 0.5));
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

export function renderAnsiFallback(
  buffer: ScreenBuffer,
  pixels: Uint8Array,
  width: number,
  height: number,
  client: { x: number; y: number; width: number; height: number },
  bgRgb: { r: number; g: number; b: number },
  _bgHex: string,
): void {
  const pixelWidth = client.width * 2;
  const pixelHeight = client.height * 2;

  const scaledPixels = resizeImage(pixels, width, height, pixelWidth, pixelHeight);

  // Blend transparency with the background color
  for (let i = 0; i < scaledPixels.length; i += 4) {
    const alpha = scaledPixels[i + 3] / 255;
    scaledPixels[i] = Math.round(scaledPixels[i] * alpha + bgRgb.r * (1 - alpha));
    scaledPixels[i + 1] = Math.round(scaledPixels[i + 1] * alpha + bgRgb.g * (1 - alpha));
    scaledPixels[i + 2] = Math.round(scaledPixels[i + 2] * alpha + bgRgb.b * (1 - alpha));
    scaledPixels[i + 3] = 255;
  }

  // Unicode quadrant characters map (0 to 15)
  const QUADRANTS = [
    " ",
    "▘",
    "▝",
    "▀",
    "▖",
    "▌",
    "▞",
    "▛",
    "▗",
    "▚",
    "▐",
    "▜",
    "▄",
    "▙",
    "▟",
    "█",
  ];

  const colorDistSq = (
    c1: { r: number; g: number; b: number },
    c2: { r: number; g: number; b: number },
  ) => {
    const dr = c1.r - c2.r;
    const dg = c1.g - c2.g;
    const db = c1.b - c2.b;
    return dr * dr + dg * dg + db * db;
  };

  const getSubpixel = (x: number, y: number) => {
    const idx = (y * pixelWidth + x) * 4;
    return {
      r: scaledPixels[idx],
      g: scaledPixels[idx + 1],
      b: scaledPixels[idx + 2],
    };
  };

  for (let dy = 0; dy < client.height; dy++) {
    for (let dx = 0; dx < client.width; dx++) {
      // Extract the 4 subpixels in the 2x2 grid for this cell
      const qTL = getSubpixel(dx * 2, dy * 2);
      const qTR = getSubpixel(dx * 2 + 1, dy * 2);
      const qBL = getSubpixel(dx * 2, dy * 2 + 1);
      const qBR = getSubpixel(dx * 2 + 1, dy * 2 + 1);

      const quadrants = [qTL, qTR, qBL, qBR];

      // Calculate the average color of the cell
      const avgColor = {
        r: Math.round((qTL.r + qTR.r + qBL.r + qBR.r) / 4),
        g: Math.round((qTL.g + qTR.g + qBL.g + qBR.g) / 4),
        b: Math.round((qTL.b + qTR.b + qBL.b + qBR.b) / 4),
      };

      let bestQuadMask = 0;
      let bestQuadError = Number.POSITIVE_INFINITY;
      let bestQuadFg = avgColor;
      let bestQuadBg = avgColor;

      // Evaluate all 16 quadrant masks
      for (let m = 0; m < 16; m++) {
        let fgCount = 0;
        let fgR = 0;
        let fgG = 0;
        let fgB = 0;
        let bgCount = 0;
        let bgR = 0;
        let bgG = 0;
        let bgB = 0;

        for (let i = 0; i < 4; i++) {
          const isFg = (m & (1 << i)) !== 0;
          if (isFg) {
            fgCount++;
            fgR += quadrants[i].r;
            fgG += quadrants[i].g;
            fgB += quadrants[i].b;
          } else {
            bgCount++;
            bgR += quadrants[i].r;
            bgG += quadrants[i].g;
            bgB += quadrants[i].b;
          }
        }

        const fg =
          fgCount > 0
            ? {
                r: Math.round(fgR / fgCount),
                g: Math.round(fgG / fgCount),
                b: Math.round(fgB / fgCount),
              }
            : avgColor;
        const bg =
          bgCount > 0
            ? {
                r: Math.round(bgR / bgCount),
                g: Math.round(bgG / bgCount),
                b: Math.round(bgB / bgCount),
              }
            : avgColor;

        let error = 0;
        for (let i = 0; i < 4; i++) {
          const isFg = (m & (1 << i)) !== 0;
          error += colorDistSq(quadrants[i], isFg ? fg : bg);
        }

        if (error < bestQuadError) {
          bestQuadError = error;
          bestQuadMask = m;
          bestQuadFg = fg;
          bestQuadBg = bg;
        }
      }

      const toHex = (c: number) => c.toString(16).padStart(2, "0");
      const fgHexVal = `#${toHex(bestQuadFg.r)}${toHex(bestQuadFg.g)}${toHex(bestQuadFg.b)}`;
      const bgHexVal = `#${toHex(bestQuadBg.r)}${toHex(bestQuadBg.g)}${toHex(bestQuadBg.b)}`;

      buffer.cells[client.y + dy][client.x + dx] = {
        char: QUADRANTS[bestQuadMask],
        style: new Style({
          color: fgHexVal,
          background: bgHexVal,
        }),
        wideContinuation: false,
      };
    }
  }
}
