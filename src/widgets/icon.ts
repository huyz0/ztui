import { App } from "../core/app.ts";
import { Widget } from "../dom/widget.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { charWidth } from "../render/segment.ts";
import { Style } from "../render/style.ts";

export class IconWidget extends Widget {
  public name = "";

  constructor() {
    super("icon");
    this.defaultStyle = {
      width: 2,
      height: 1,
    };
  }

  public override render(buffer: ScreenBuffer): void {
    if (!this.visible) return;

    super.render(buffer);
    const client = this.getClientRect();
    if (client.width < 2 || client.height < 1) return;

    const fg = this.computedStyle.color || "default";
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

    const driver = App.instance?.driver;
    const char = driver ? driver.getIconSequence(this.name, fg, resolvedBg) : "";
    if (!char) return;

    const isEscapeSequence = char.startsWith("\x1b");

    if (isEscapeSequence) {
      // Clear the cells by outputting spaces first, then the graphic sequence, and finally advance the cursor.
      const wrappedChar = `\x1b[s  \x1b[u${char}\x1b[2C`;
      buffer.cells[client.y][client.x] = { char: wrappedChar, style, wideContinuation: false };
      if (client.x + 1 < buffer.width) {
        buffer.cells[client.y][client.x + 1] = { char: "", style, wideContinuation: true };
      }
    } else {
      // For text fallbacks, emojis, or PUA glyphs
      buffer.setCell(client.x, client.y, char, style);
      const w = charWidth(char);
      if (w < 2 && client.x + 1 < buffer.width) {
        buffer.setCell(client.x + 1, client.y, " ", style);
      }
    }
  }
}
