import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface SyncRenderResult {
  pngBase64: string;
  pixels: Uint8Array;
  width: number;
  height: number;
}

/**
 * Runs a `sharp-*-sync.ts` helper script in a subprocess and returns its
 * parsed `data` payload. Shared by {@link renderSvgSync} and
 * {@link decodeRasterViaSharp} — sharp is an optional dependency, so this is
 * also where "sharp isn't installed" is turned into one actionable error
 * message instead of a raw module-resolution stack trace.
 */
function runSharpScript(scriptName: string, payload: string, forFeature: string): any {
  const scriptPath = join(__dirname, scriptName);

  const res = spawnSync("bun", ["run", scriptPath], {
    input: payload,
    encoding: "utf-8",
    maxBuffer: 1024 * 1024 * 64,
  });

  if (!res) {
    throw new Error(
      `Failed to spawn ${scriptName}: spawnSync returned undefined (possibly mocked)`,
    );
  }

  if (res.error) {
    throw new Error(`Failed to spawn ${scriptName}: ${res.error.message}`);
  }

  // sharp is an optional dependency: if it isn't installed the subprocess
  // exits before emitting JSON, with a module-resolution error on stderr.
  const stderr = res.stderr || "";
  const sharpMissing =
    /Cannot find (module|package) ['"]?sharp/.test(stderr) ||
    (res.status !== 0 && !res.stdout.trim() && /sharp/.test(stderr));
  if (sharpMissing) {
    throw new Error(
      `${forFeature} requires the optional 'sharp' dependency, which is not installed. ` +
        "Install it to enable this: `bun add sharp` (or `npm i sharp`).",
    );
  }

  let result: any;
  try {
    result = JSON.parse(res.stdout.trim());
  } catch (err: any) {
    throw new Error(
      `Failed to parse ${scriptName} output: ${res.stdout || ""}. Stderr: ${res.stderr || ""}. Error: ${err.message}`,
    );
  }

  if (!result.success) {
    throw new Error(`Sharp sync render error: ${result.error}`);
  }

  return result.data;
}

export function renderSvgSync(options: {
  svg: string;
  width: number;
  height: number;
  isIcon: boolean;
  color?: string;
  bgHex?: string;
  fit?: "fill" | "contain" | "cover" | "inside" | "outside";
}): SyncRenderResult {
  const payload = JSON.stringify(options);
  const data = runSharpScript("sharp-render-sync.ts", payload, "SVG/Mermaid rendering");

  return {
    pngBase64: data.pngBase64,
    pixels: new Uint8Array(Buffer.from(data.pixelsBase64, "base64")),
    width: data.width,
    height: data.height,
  };
}

/**
 * Decodes a raster image (WebP, AVIF, TIFF, or anything else sharp reads) at
 * its native resolution — no resize, unlike {@link renderSvgSync}. Used as a
 * fallback in {@link import("../widgets/media/image.ts").decodeImage} for
 * formats the pure-JS PNG/JPEG/GIF decoders don't handle.
 */
export function decodeRasterViaSharp(
  buffer: Uint8Array,
): Pick<SyncRenderResult, "pixels" | "width" | "height"> {
  const payload = JSON.stringify({ bufferBase64: Buffer.from(buffer).toString("base64") });
  const data = runSharpScript("sharp-decode-sync.ts", payload, "WebP/AVIF image decoding");

  return {
    pixels: new Uint8Array(Buffer.from(data.pixelsBase64, "base64")),
    width: data.width,
    height: data.height,
  };
}
