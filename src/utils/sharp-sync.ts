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
  const scriptPath = join(__dirname, "sharp-render-sync.ts");

  const res = spawnSync("bun", ["run", scriptPath], {
    input: payload,
    encoding: "utf-8",
    maxBuffer: 1024 * 1024 * 16,
  });

  if (!res) {
    throw new Error(
      "Failed to spawn sharp-render-sync: spawnSync returned undefined (possibly mocked)",
    );
  }

  if (res.error) {
    throw new Error(`Failed to spawn sharp-render-sync: ${res.error.message}`);
  }

  let result: any;
  try {
    result = JSON.parse(res.stdout.trim());
  } catch (err: any) {
    throw new Error(
      `Failed to parse sharp-render-sync output: ${res.stdout || ""}. Stderr: ${res.stderr || ""}. Error: ${err.message}`,
    );
  }

  if (!result.success) {
    throw new Error(`Sharp sync render error: ${result.error}`);
  }

  return {
    pngBase64: result.data.pngBase64,
    pixels: new Uint8Array(Buffer.from(result.data.pixelsBase64, "base64")),
    width: result.data.width,
    height: result.data.height,
  };
}
