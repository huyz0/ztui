import { fileURLToPath } from "node:url";
import { BUNDLED_FONT_FAMILY, HTML_FONT_SIZE } from "../../render/html-renderer.ts";

/**
 * Shared host-page chrome for the web backend, used by both the live demo
 * server and the {@link WebInspector}. Keeping the CSS here means what an agent
 * screenshots through the inspector is byte-for-byte what a user sees in the
 * browser — the two can't drift.
 */

export interface WebFontFace {
  family: string;
  weight: number;
  /** A URL the page can fetch (`/fonts/x.woff2`) or a `data:` URI (inspector). */
  url: string;
  /** woff2 (default) or woff — the Seti icon font ships as woff. */
  format?: "woff" | "woff2";
}

/** The bundled regular+bold font pair ({@link BUNDLED_FONT_FAMILY}), given the URLs to serve them at. */
export function bundledFontFaces(regularUrl: string, boldUrl: string): WebFontFace[] {
  return [
    { family: BUNDLED_FONT_FAMILY, weight: 400, url: regularUrl },
    { family: BUNDLED_FONT_FAMILY, weight: 700, url: boldUrl },
  ];
}

/**
 * Absolute path to a bundled Cascadia Mono webfont (`resources/fonts/`).
 *
 * These are the upstream Microsoft Cascadia Mono webfonts (MIT, from Windows
 * Terminal) — a complete terminal font carrying the box-drawing (U+2500+) and
 * block-element glyphs (`█ ░`) that borders and scrollbars need. A Latin-subset
 * build omits those, so the browser falls back to a system font whose glyphs
 * don't fill the cell, leaving dashed seams.
 */
export function bundledFontPath(weight: 400 | 700): string {
  const file = weight >= 700 ? "CascadiaMono-Bold.woff2" : "CascadiaMono-Regular.woff2";
  return fileURLToPath(new URL(`../../../resources/fonts/${file}`, import.meta.url));
}

/**
 * Absolute path to the vendored Seti icon webfont (`resources/seti/seti.woff`).
 * Loading it as a `@font-face` (family `Seti`) lets the private-use file-icon
 * codepoints render on the web backend — the terminal draws these via the
 * graphics/glyph protocol, which the browser doesn't have.
 */
export function setiFontPath(): string {
  return fileURLToPath(new URL("../../../resources/seti/seti.woff", import.meta.url));
}

/** A `@font-face` descriptor for the Seti icon font, given the URL to serve it at. */
export function setiFontFace(url: string): WebFontFace {
  return { family: "Seti", weight: 400, url, format: "woff" };
}

/**
 * The `<style>` body for a host page: the `@font-face` rules plus the rules
 * that make the grid behave like a terminal rather than a document — no window
 * scroll (the grid is sized to fit), no text selection, and a normal pointer.
 */
export function webHostStyles(fonts: WebFontFace[]): string {
  const faces = fonts
    .map(
      (f) =>
        `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-display:block;src:url('${f.url}') format('${f.format ?? "woff2"}');}`,
    )
    .join("\n");
  return `${faces}
/* Hard reset: every box is border-box with no margin/padding, so nothing
   inherits stray spacing. Line height is left to the grid (it sets its own) so
   rows inherit it rather than being forced to 1 here. */
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
html,body{height:100%;background:#1e1e2e;overflow:hidden;}
#screen{outline:none;cursor:default;user-select:none;-webkit-user-select:none;}`;
}

/**
 * A complete, self-contained HTML document that renders one already-composed
 * grid frame (`gridHTML` from `renderBufferToHTML`). No scripts — for
 * screenshots and geometry inspection.
 */
export function renderWebHostDocument(gridHTML: string, fonts: WebFontFace[]): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${webHostStyles(fonts)}</style></head><body><div id="screen" tabindex="0">${gridHTML}</div></body></html>`;
}

/** The CSS font-size (px) the grid is rendered at — handy for cell math. */
export const WEB_FONT_SIZE = HTML_FONT_SIZE;
