import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { iconRegistry } from "../icon-registry.ts";

export interface SetiTheme {
  iconDefinitions: Record<string, { fontCharacter: string; fontColor: string }>;
  fileExtensions: Record<string, string>;
  fileNames: Record<string, string>;
  languageIds: Record<string, string>;
}

export interface ResolvedIcon {
  name: string;
  color: string;
}

// --------------------------------------------------------------------------
// Module-level state
// --------------------------------------------------------------------------

let setiTheme: SetiTheme | null = null;
let setiFont: ReturnType<typeof import("opentype.js")["parse"]> | null = null;
let themeLoaded = false;
let fontLoaded = false;

/** Tracks which seti icon keys have already been registered (lazy cache). */
const registeredKeys = new Set<string>();

// --------------------------------------------------------------------------
// Built-in folder icon (inline SVG — no heroicons dependency)
// --------------------------------------------------------------------------

const FOLDER_ICON_NAME = "seti:_folder";

const FOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
  <path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h15ZM1.5 10.146V6a3 3 0 0 1 3-3h5.379a2.25 2.25 0 0 1 1.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 0 1 3 3v1.146A4.483 4.483 0 0 0 19.5 12h-15a4.483 4.483 0 0 0-3 1.146Z" />
</svg>`;

/** Registers the built-in folder icon once. */
function ensureFolderIconRegistered(): void {
  if (iconRegistry.get(FOLDER_ICON_NAME)) return;
  iconRegistry.registerIcon({
    name: FOLDER_ICON_NAME,
    svg: FOLDER_SVG,
    textFallback: "📁",
  });
}

// --------------------------------------------------------------------------
// Internal loaders
// --------------------------------------------------------------------------

function getResourcesDir(customDir?: string): string {
  return customDir ?? join(import.meta.dirname, "../../../resources/seti");
}

/**
 * Loads the JSON theme mapping only (fast, ~50 KB).
 * Called automatically by resolveFileIcon on first use.
 */
export function loadSetiTheme(customResourcesDir?: string): void {
  if (themeLoaded) return;

  const resourcesDir = getResourcesDir(customResourcesDir);
  const jsonPath = join(resourcesDir, "vs-seti-icon-theme.json");

  if (!existsSync(jsonPath)) {
    throw new Error(`Seti theme JSON not found at: ${jsonPath}`);
  }

  setiTheme = JSON.parse(readFileSync(jsonPath, "utf-8")) as SetiTheme;
  themeLoaded = true;
}

/**
 * Loads and caches the Seti WOFF font (once, on first demand).
 * Subsequent calls are no-ops.
 */
function ensureFontLoaded(customResourcesDir?: string): void {
  if (fontLoaded) return;

  const resourcesDir = getResourcesDir(customResourcesDir);
  const woffPath = join(resourcesDir, "seti.woff");

  if (!existsSync(woffPath)) {
    throw new Error(`Seti font not found at: ${woffPath}`);
  }

  // Dynamic require so the font is only parsed when first needed
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const opentype = require("opentype.js") as typeof import("opentype.js");
  const fontBuffer = readFileSync(woffPath);
  setiFont = opentype.parse(
    fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength),
  );
  fontLoaded = true;
}

/**
 * Lazily extract a single glyph from the Seti font and register it.
 * Subsequent calls for the same key are no-ops (cached in `registeredKeys`).
 */
export function registerSetiIcon(key: string): void {
  if (registeredKeys.has(key)) return;
  registeredKeys.add(key);

  if (!setiTheme) return;

  const def = setiTheme.iconDefinitions[key];
  if (!def) return;

  try {
    ensureFontLoaded();
  } catch {
    // Font unavailable — register a fallback-only entry
    iconRegistry.registerIcon({ name: `seti:${key}`, svg: "", textFallback: " " });
    return;
  }

  if (!setiFont) return;

  try {
    const hexVal = def.fontCharacter.replace(/\\/gi, "");
    const codePoint = parseInt(hexVal, 16);
    if (Number.isNaN(codePoint)) return;

    const char = String.fromCodePoint(codePoint);
    const glyph = setiFont.charToGlyph(char);

    const path = glyph.getPath(0, 0, 1024);
    const bbox = path.getBoundingBox();

    const width = bbox.x2 - bbox.x1;
    const height = bbox.y2 - bbox.y1;
    const size = Math.max(width, height);

    let svg: string;
    if (size > 0) {
      const dx = (size - width) / 2;
      const dy = (size - height) / 2;
      // opentype.js getPath() already emits SVG-space coordinates (Y down),
      // so we only need a translate to shift the glyph into the padded viewport.
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <g transform="translate(${-bbox.x1 + dx}, ${-bbox.y1 + dy})">
    <path d="${path.toPathData(2)}" fill="currentColor" />
  </g>
</svg>`;
    } else {
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"></svg>`;
    }

    iconRegistry.registerIcon({ name: `seti:${key}`, svg, textFallback: char });
  } catch {
    // Ignore failures for specific glyphs
    iconRegistry.registerIcon({ name: `seti:${key}`, svg: "", textFallback: " " });
  }
}

/**
 * Eagerly loads ALL Seti icons at once (backward-compatible API).
 * For most use cases, prefer the automatic lazy loading via `resolveFileIcon`.
 *
 * @param customResourcesDir Optional path override for the resources folder.
 */
export function loadSetiIcons(customResourcesDir?: string): void {
  loadSetiTheme(customResourcesDir);
  if (!setiTheme) return;

  for (const key of Object.keys(setiTheme.iconDefinitions)) {
    registerSetiIcon(key);
  }
}

// --------------------------------------------------------------------------
// Extension / filename mapping tables
// --------------------------------------------------------------------------

const EXTENSION_TO_LANGUAGE_ID: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  jsx: "javascriptreact",
  tsx: "typescriptreact",
  json: "json",
  go: "go",
  py: "python",
  rs: "rust",
  css: "css",
  html: "html",
  htm: "html",
  yaml: "yaml",
  yml: "yaml",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  bat: "bat",
  cmd: "bat",
  ps1: "powershell",
  md: "markdown",
  sql: "sql",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  java: "java",
  cs: "csharp",
  rb: "ruby",
  lua: "lua",
  pl: "perl",
  pm: "perl",
  php: "php",
  dockerfile: "dockerfile",
  makefile: "makefile",
  ini: "properties",
  properties: "properties",
};

const FILENAME_TO_DEF_KEY: Record<string, string> = {
  "package.json": "_npm",
  "package-lock.json": "_npm",
  "bun.lockb": "_npm",
  "yarn.lock": "_yarn",
  "tsconfig.json": "_tsconfig",
  "readme.md": "_info",
  license: "_license",
  makefile: "_makefile",
  dockerfile: "_docker",
};

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

/**
 * Resolves a filename, extension, or language ID to its Seti icon name and
 * VS Code color, and lazily registers that single icon in the icon registry.
 *
 * The theme JSON is loaded on the first call; the WOFF font is parsed only
 * when the first icon is actually needed — keeping startup fast.
 */
export function resolveFileIcon(
  filename: string,
  isFolder?: boolean,
  languageId?: string,
): ResolvedIcon {
  // Lazy-load the theme JSON (fast path — no font parsing)
  if (!themeLoaded) {
    try {
      loadSetiTheme();
    } catch {
      // Resources missing — fall through to defaults
    }
  }

  if (isFolder) {
    ensureFolderIconRegistered();
    return { name: FOLDER_ICON_NAME, color: "#89b4fa" };
  }

  if (!setiTheme) {
    return { name: "seti:_default", color: "#d4d7d6" };
  }

  const lowerName = filename.toLowerCase();

  // 1. Match exact file name (with overrides)
  let defKey =
    FILENAME_TO_DEF_KEY[filename] ||
    FILENAME_TO_DEF_KEY[lowerName] ||
    setiTheme.fileNames[filename] ||
    setiTheme.fileNames[lowerName];

  // 2. Match file extension (supports multi-part extensions e.g. .test.ts)
  if (!defKey) {
    const parts = lowerName.split(".");
    if (parts.length > 1) {
      for (let i = 1; i < parts.length; i++) {
        const ext = parts.slice(i).join(".");
        if (setiTheme.fileExtensions[ext]) {
          defKey = setiTheme.fileExtensions[ext];
          break;
        }
      }
    }
  }

  // 3. Resolve language ID (passed in or inferred from extension)
  let resolvedLangId = languageId;
  if (!defKey && !resolvedLangId) {
    const lastDot = lowerName.lastIndexOf(".");
    if (lastDot !== -1) {
      resolvedLangId = EXTENSION_TO_LANGUAGE_ID[lowerName.slice(lastDot + 1)];
    }
  }
  if (!defKey && resolvedLangId && setiTheme.languageIds[resolvedLangId]) {
    defKey = setiTheme.languageIds[resolvedLangId];
  }

  // 4. Default fallback
  if (!defKey) defKey = "_default";

  const definition = setiTheme.iconDefinitions[defKey] ?? { fontColor: "#d4d7d6" };

  // Lazy-register only this icon (font parsed on first call, cached thereafter)
  registerSetiIcon(defKey);

  return {
    name: `seti:${defKey}`,
    color: definition.fontColor,
  };
}
