import { Scrollable } from "../../dom/scrollable.ts";
import { Widget } from "../../dom/widget.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { charWidth, splitGraphemes, stringWidth } from "../../render/segment.ts";

export class BoxWidget extends Widget {
  /** Optional text drawn into the top border edge (only shown when the box has a border). */
  public title = "";

  constructor() {
    super("box");
  }

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
    this.drawTitle(buffer);
  }

  /**
   * Paints `title` onto the top border row as `─ title ─`, left-aligned just
   * inside the top-left corner. No-op without a title or a visible border.
   * Truncates with `…` when it would overrun the right corner.
   */
  private drawTitle(buffer: ScreenBuffer): void {
    if (!this.title) return;
    const border = this.computedStyle.border;
    if (!border || border === "none") return;

    const rect = this.getClientRect();
    // Reserve the two corners plus one border cell of padding on each side.
    const available = rect.width - 4;
    if (available <= 0) return;

    const label = ` ${truncateToWidth(this.title, available)} `;
    // Reuse the style of the border edge that super.render() already drew, so
    // the title inherits the box's border color without recomputing it.
    const borderStyle = buffer.cells[rect.y]?.[rect.x + 1]?.style;
    if (!borderStyle) return;

    let x = rect.x + 2;
    for (const ch of splitGraphemes(label)) {
      if (x >= rect.right - 1) break;
      buffer.setCell(x, rect.y, ch, borderStyle);
      x += charWidth(ch);
    }
  }
}

/** Truncate a string to at most `max` display columns, appending `…` if cut. */
function truncateToWidth(text: string, max: number): string {
  if (stringWidth(text) <= max) return text;
  if (max <= 1) return "…";
  let out = "";
  let w = 0;
  for (const ch of splitGraphemes(text)) {
    const cw = charWidth(ch);
    if (w + cw > max - 1) break;
    out += ch;
    w += cw;
  }
  return `${out}…`;
}

export class ScrollableBoxWidget extends Scrollable(BoxWidget) {
  constructor() {
    super();
    // We can customize scrollable box tag name if needed, but it will inherit "box" tag.
    // Let's set it to "scrollable-box" for cleaner DOM selector matching.
    this.tagName = "scrollable-box";
  }
}
