import { Widget } from "../dom/widget.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { iconRegistry } from "../render/icon-registry.ts";
import { Style } from "../render/style.ts";
import { type ResolvedIcon, resolveFileIcon } from "./seti/seti-loader.ts";

/**
 * A widget that automatically resolves and renders the VS Code Seti file icon
 * for a given file extension, filename, or language ID.
 *
 * Props (set via JSX or directly on the instance):
 *   - `extension`  — bare extension without the dot, e.g. "ts", "json", "rs"
 *   - `filename`   — full filename, e.g. "package.json", "Makefile"
 *   - `isFolder`   — treat as a directory icon (default false)
 *   - `languageId` — VS Code language identifier override, e.g. "typescript"
 *
 * Resolution priority: filename > extension > languageId > default.
 * Icons are loaded lazily — the WOFF font is parsed only on first use.
 */
export class FileIconWidget extends Widget {
  /** Bare extension without the dot, e.g. "ts". Takes priority after filename. */
  public extension = "";

  /** Full filename, e.g. "package.json". Highest resolution priority. */
  public filename = "";

  /** Treat as folder icon. */
  public isFolder = false;

  /** VS Code language ID override. */
  public languageId = "";

  constructor() {
    super("file-icon");
    this.defaultStyle = {
      width: 2,
      height: 1,
    };
  }

  /** Derive the effective filename to pass to resolveFileIcon. */
  private get _effectiveFilename(): string {
    if (this.filename) return this.filename;
    if (this.extension) return `_placeholder.${this.extension}`;
    return "_placeholder";
  }

  /** Resolve the icon name and color for the current props. */
  public resolve(): ResolvedIcon {
    return resolveFileIcon(this._effectiveFilename, this.isFolder, this.languageId || undefined);
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;

    super.render(buffer);
    const client = this.getClientRect();
    if (client.width < 2 || client.height < 1) return;

    const resolved = this.resolve();

    // Use style color if explicitly set, otherwise use the Seti theme color
    const fg = this.computedStyle.color || resolved.color;

    let resolvedBg = this.findResolvedBackground();
    if (resolvedBg === "default") {
      resolvedBg = "#1e1e2e";
    }

    const style = new Style({
      color: fg,
      background: resolvedBg,
      bold: this.computedStyle.bold,
      italic: this.computedStyle.italic,
      underline: this.computedStyle.underline,
      reverse: this.computedStyle.reverse,
      dim: this.computedStyle.dim,
      strikethrough: this.computedStyle.strikethrough,
      link: this.computedStyle.link,
    });

    const icon = iconRegistry.get(resolved.name);
    const textFallback = icon ? icon.textFallback : "  ";

    buffer.cells[client.y][client.x] = {
      char: textFallback,
      style,
      wideContinuation: false,
      icon: resolved.name,
    };

    if (client.x + 1 < buffer.width) {
      buffer.cells[client.y][client.x + 1] = {
        char: "",
        style,
        wideContinuation: true,
      };
    }
  }
}
