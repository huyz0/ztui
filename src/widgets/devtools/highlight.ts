import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";

/** A screen-absolute rect to highlight. */
export interface HighlightTarget {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The DevTools "highlight": a full-screen, pointer-transparent overlay that
 * **tints the cells** of {@link target} (a screen-absolute rect) rather than
 * drawing a character border — so it never overwrites the inspected widget's
 * glyphs, and it can't land in the wrong place (it paints at absolute screen
 * coordinates, independent of its own layout). Mount it under a full-screen root
 * so the render clip spans the screen.
 */
export class DevToolsHighlightWidget extends Widget {
  /** The screen rect to tint, or null for nothing. */
  public target: HighlightTarget | null = null;

  constructor() {
    super("devtools-highlight");
    // Decorative overlay: clicks fall through to the UI beneath.
    this.pointerTransparent = true;
  }

  public override render(buffer: ScreenBuffer): void {
    const t = this.target;
    if (!t || t.width < 1 || t.height < 1) return;
    const resolver = App.instance?.cssResolver;
    const bg = resolver?.resolveVariable(this, "$accent") || "magenta";
    const fg = resolver?.resolveVariable(this, "$background") || "black";
    const style = this.cachedStyle({ color: fg, background: bg });
    // Re-paint each target cell with the accent background, keeping its glyph —
    // a non-destructive block highlight. Reads under the full-screen clip.
    for (let y = t.y; y < t.y + t.height; y++) {
      if (y < 0 || y >= buffer.height) continue;
      const row = buffer.cells[y];
      for (let x = t.x; x < t.x + t.width; x++) {
        if (x < 0 || x >= buffer.width) continue;
        const ch = row[x]?.char || " ";
        buffer.setCell(x, y, ch, style);
      }
    }
  }
}
