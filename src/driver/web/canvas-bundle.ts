import { fileURLToPath } from "node:url";

/**
 * Bundle {@link canvas-client.ts} for the browser (via `Bun.build`) and return
 * the JS as a string, so the live demo can serve it and the {@link WebInspector}
 * can inject it. Server-only (uses the Bun bundler); cached after first build.
 */
let cached: string | null = null;

export async function canvasClientScript(): Promise<string> {
  if (cached) return cached;
  const entry = fileURLToPath(new URL("./canvas-client.ts", import.meta.url));
  const out = await Bun.build({ entrypoints: [entry], target: "browser", minify: true });
  if (!out.success) {
    throw new AggregateError(out.logs, "Failed to bundle the ztui canvas client");
  }
  cached = await out.outputs[0].text();
  return cached;
}
