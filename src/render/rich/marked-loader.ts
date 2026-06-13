import { createRequire } from "node:module";
import type { marked as markedFn } from "marked";

/**
 * `marked` is an optional peer dependency of the `ztui/markdown` entry. It is
 * loaded lazily via a synchronous `require` (works for `marked`'s ESM under both
 * Node's require(esm) and Bun), keeping the synchronous render path intact. If it
 * is not installed, an actionable error is thrown on first use rather than a raw
 * module-resolution failure at import time.
 */
let markedRuntime: typeof markedFn | undefined;
export function getMarked(): typeof markedFn {
  if (markedRuntime === undefined) {
    try {
      const require = createRequire(import.meta.url);
      markedRuntime = (require("marked") as typeof import("marked")).marked;
    } catch {
      throw new Error(
        "Markdown rendering requires the optional 'marked' dependency, which is not installed. " +
          "Install it to use `ztui/markdown`: `bun add marked` (or `npm i marked`).",
      );
    }
  }
  return markedRuntime;
}
