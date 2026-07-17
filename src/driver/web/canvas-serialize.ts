import type { ScreenBuffer } from "../../render/buffer.ts";
import { normalizeColorForCSS } from "../../render/html-renderer.ts";
import { iconRegistry } from "../../render/icon-registry.ts";
import { ThemeManager } from "../../theme.ts";
import type { CanvasCell, SerializedFrame } from "./canvas-renderer.ts";

/**
 * Flatten a {@link ScreenBuffer} into the compact, JSON-serializable grid the
 * canvas client consumes (colors resolved to CSS up front), alongside the
 * active theme's foreground/background — the fallback for any cell that
 * never resolved an explicit color (most plain text: leaving `color` unset
 * is normal and correct for a terminal app, where "unset" means "the
 * terminal's own default"). A canvas has no such terminal-default concept,
 * so it must paint *some* concrete color; without this, it fell back to a
 * hardcoded catppuccin-mocha foreground regardless of the active theme —
 * fine by coincidence on dark themes, unreadable on light ones. This is the
 * **server-side** half of the canvas backend: it may touch the icon registry
 * (and, transitively, Node-only deps), so it is kept out of `canvas-renderer.ts`
 * — which must bundle cleanly for the browser.
 *
 * Vector icons (heroicons, Seti file icons) are resolved to their raw SVG here
 * and shipped on the cell, so the client can rasterize them natively at the
 * device pixel ratio instead of drawing an emoji/glyph text fallback.
 */
export function serializeForCanvas(buffer: ScreenBuffer): SerializedFrame {
  const rows: CanvasCell[][] = [];
  for (let y = 0; y < buffer.height; y++) {
    const row: CanvasCell[] = [];
    for (let x = 0; x < buffer.width; x++) {
      const cell = buffer.cells[y][x];
      if (cell.wideContinuation) {
        // Inherit the lead cell's background so a wide glyph's two halves fill
        // with one color instead of leaving the right half on the page default.
        row.push({ c: "", cont: true, bg: row[row.length - 1]?.bg });
        continue;
      }
      const s = cell.style;
      let fg = s.color;
      let bg = s.background;
      if (s.reverse) [fg, bg] = [bg, fg];
      const out: CanvasCell = { c: cell.char };
      if (fg && fg !== "default") out.fg = normalizeColorForCSS(fg);
      if (bg && bg !== "default") out.bg = normalizeColorForCSS(bg);
      if (s.bold) out.bold = true;
      if (s.italic) out.italic = true;
      if (s.underline) {
        out.underline = true;
        if (s.underlineStyle && s.underlineStyle !== "single") out.uStyle = s.underlineStyle;
        if (s.underlineColor) out.uColor = normalizeColorForCSS(s.underlineColor);
      }
      if (s.strikethrough) out.strike = true;
      if (cell.icon) {
        out.icon = true;
        // Ship the icon's vector source so the canvas renders it natively. Falls
        // back to the `c` glyph/emoji when the icon has no SVG (e.g. a missing
        // Seti glyph registered with an empty svg).
        const svg = iconRegistry.get(cell.icon)?.svg;
        if (svg) out.svg = svg;
      }
      // Image/SVG widgets: ship a ready-to-draw source (raw SVG → data URI, or the
      // already-encoded PNG) plus the cell span, so the canvas draws it natively.
      const g = cell.graphic;
      if (g) {
        if (g.svg) out.img = `data:image/svg+xml,${encodeURIComponent(g.svg)}`;
        else if (g.pngBase64) out.img = `data:image/png;base64,${g.pngBase64}`;
        if (out.img) {
          out.gw = g.cellWidth;
          out.gh = g.cellHeight;
        }
      }
      row.push(out);
    }
    rows.push(row);
  }
  const theme = ThemeManager.getInstance().getActiveTheme();
  return { cells: rows, defaultFg: theme.colors.foreground, defaultBg: theme.colors.background };
}
