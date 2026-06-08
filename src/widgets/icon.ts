import { Widget } from "../dom/widget.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { Style } from "../render/style.ts";
import { iconRegistry } from "./icon-registry.ts";

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

    const icon = iconRegistry.get(this.name);
    const textFallback = icon ? icon.textFallback : "";

    if (client.y < 0 || client.y >= buffer.height || client.x < 0 || client.x >= buffer.width) {
      return;
    }

    buffer.cells[client.y][client.x] = {
      char: textFallback,
      style,
      wideContinuation: false,
      icon: this.name,
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
