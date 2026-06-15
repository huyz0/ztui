import { App } from "../core/app.ts";
import { Widget } from "../dom/widget.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { Style } from "../render/style.ts";

/** Idle glyph (two overlapping pages) and the post-copy acknowledgement. */
const COPY_GLYPH = "⧉";
const DONE_GLYPH = "✓";
/** How long the `✓` acknowledgement stays up before reverting to `⧉`. */
const ACK_MS = 1200;

/**
 * A small "copy to clipboard" affordance pinned to the top-right of its parent's
 * content. Implemented as a real (absolutely positioned, high z-index) child so
 * it participates in hit-testing and hover the same as any widget — a plain
 * overlay drawn in the parent's `render` can't receive clicks once the parent
 * has children painted over that cell (e.g. markdown blocks).
 *
 * The host sets {@link getText} to supply what gets copied (raw code, raw
 * markdown, …) and adds the instance as a child. Hover lightens the pill via a
 * `$panel` background; a click copies and briefly shows `✓`.
 */
export class CopyButtonWidget extends Widget {
  /** Supplies the text to copy. Set by the host widget. */
  public getText: () => string = () => "";
  private hovered = false;
  private copied = false;
  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    super("copy-button");
    this.selectable = false;
    this.focusable = false;
    // Pinned to the parent's viewport top-right (doesn't scroll away), above the
    // content so the glyph stays visible over text behind it.
    this.positionFixed = true;
    this.style = { position: "absolute", top: 0, right: 0, width: 2, height: 1, zIndex: 50 };
    this.onClick = () => this.copy();
    // Hover only changes this button's own colors — a paint-only change. Use
    // queueRepaint so sweeping the pointer across content on a hover-capable
    // terminal (e.g. Ghostty) doesn't relayout the whole tree each time the
    // cursor crosses the button.
    this.onMouseEnter = () => {
      this.hovered = true;
      App.instance?.queueRepaint();
    };
    this.onMouseLeave = () => {
      this.hovered = false;
      App.instance?.queueRepaint();
    };
  }

  private copy(): void {
    const text = this.getText();
    if (text) App.instance?.driver.clipboard.set(text);
    this.copied = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.copied = false;
      App.instance?.queueRender();
    }, ACK_MS);
    App.instance?.queueRender();
  }

  public override render(buffer: ScreenBuffer): void {
    const box = this.getClientRect();
    if (box.width < 1 || box.height < 1) return;

    const resolve = (v?: string) =>
      v ? App.instance?.cssResolver.resolveVariable(this, v) || v : undefined;
    // Idle: reuse the background already painted behind the glyph (the parent
    // renders its content/background before this overlay), so the cell blends in
    // exactly — whatever the theme resolves to. Reading the buffer rather than
    // re-resolving a token avoids a mismatch that renders as a dark square on
    // terminals whose own default background differs from the theme (e.g.
    // Windows Terminal). Hover: a raised `$panel` chip.
    const underBg = buffer.cells[box.y]?.[box.x]?.style.background;
    const bg = this.hovered ? resolve("$panel") : underBg;
    const fgVar = this.copied ? "$success" : this.hovered ? "$accent" : "$dimmed";
    const cellStyle = new Style({
      color: resolve(fgVar),
      background: bg,
      dim: !this.hovered && !this.copied,
    });

    // On hover, fill the whole box so the background reads as a solid chip (no
    // gaps); the glyph sits flush at the left with a one-cell right margin.
    if (this.hovered) {
      for (let x = box.x; x < box.right; x++) buffer.setCell(x, box.y, " ", cellStyle);
    }
    buffer.setCell(box.x, box.y, this.copied ? DONE_GLYPH : COPY_GLYPH, cellStyle);
  }
}
