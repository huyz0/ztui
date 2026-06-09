import { resolveFileIcon } from "../../../widgets/media/seti/seti-loader.ts";
import type { ComponentProps } from "../types.ts";
import { Icon } from "./icon.tsx";

export interface FileIconProps extends ComponentProps {
  /**
   * Full filename for highest-priority exact matching.
   * e.g. "package.json", "Dockerfile", "Makefile"
   */
  filename?: string;
  /**
   * Bare file extension without the dot.
   * Used when `filename` is not provided.
   * e.g. "ts", "json", "rs", "go", "py"
   */
  extension?: string;
  /** Render a folder icon instead of a file icon. */
  isFolder?: boolean;
  /** VS Code language ID override, e.g. "typescript". */
  languageId?: string;
}

/**
 * Automatically resolves and renders the VS Code Seti file icon.
 *
 * Resolution priority: filename → extension → languageId → default.
 * The Seti theme color is applied automatically; override with `style={{ color: "..." }}`.
 *
 * Icons are loaded lazily — the WOFF font is parsed only on the first
 * icon that actually needs it, and each glyph is extracted individually on demand.
 *
 * @example
 * // By extension:
 * <FileIcon extension="ts" />
 * <FileIcon extension="json" />
 *
 * // By filename (picks up special icons: package.json, Dockerfile, Makefile…):
 * <FileIcon filename="package.json" />
 * <FileIcon filename="Dockerfile" />
 *
 * // Folder icon:
 * <FileIcon isFolder />
 *
 * // Override color:
 * <FileIcon extension="py" style={{ color: "#89b4fa" }} />
 */
export function FileIcon({
  id,
  className,
  style,
  filename,
  extension,
  isFolder = false,
  languageId,
  ...rest
}: FileIconProps) {
  // Derive effective filename: prefer explicit filename, fall back to extension hint
  const effectiveFilename = filename ?? (extension ? `_placeholder.${extension}` : "_placeholder");

  const resolved = resolveFileIcon(effectiveFilename, isFolder, languageId ?? undefined);

  // Seti theme color as default; caller can override via style.color
  const combinedStyle = {
    color: resolved.color,
    ...style,
  };

  return (
    <Icon id={id} className={className} style={combinedStyle} name={resolved.name} {...rest} />
  );
}
