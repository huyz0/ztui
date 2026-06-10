import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import { Spacing } from "../../geometry/spacing.ts";
import { parseDimension } from "../../layout/layout.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";

export class ToggleButtonWidget extends Widget {
  public active = false;
  public label = "";
  public declare onChange?: (active: boolean) => void;

  constructor() {
    super("toggle-button");
    this.focusable = true;
    this.defaultStyle = { height: 1, padding: new Spacing(0, 1, 0, 1) };

    this.onKey = (ev) => {
      const keyName = ev.name || ev.key;
      if (keyName === "space" || keyName === " " || keyName === "enter") {
        this.active = !this.active;
        this.onChange?.(this.active);
        if (this.onClick) {
          this.onClick(ev);
        }
        ev.handled = true;
        App.instance?.queueRender();
      }
    };
  }

  public override handleMouse(ev: any): void {
    super.handleMouse(ev);
    if (ev.handled) return;

    if (ev.type === "press" && ev.button === "left") {
      this.active = !this.active;
      this.onChange?.(this.active);
      if (this.onClick) {
        this.onClick(ev);
      }
      App.instance?.queueRender();
      ev.handled = true;
    }
  }

  public override getTextContent(): string {
    return this.label || super.getTextContent();
  }

  public override measure(maxW: number, maxH: number): void {
    const b = this.borderSize;
    const p = this.padding;
    const text = this.getTextContent();
    const textLen = 4 + stringWidth(text); // "[ ] " is 4 columns

    if (this.computedStyle.width === undefined) {
      this.measuredWidth = textLen + b.width + p.width;
    } else {
      const wVal = parseDimension(this.computedStyle.width, maxW, -1);
      this.measuredWidth = typeof wVal === "number" ? wVal : textLen + b.width + p.width;
    }

    if (this.computedStyle.height === undefined) {
      this.measuredHeight = 1 + b.height + p.height;
    } else {
      const hVal = parseDimension(this.computedStyle.height, maxH, -1);
      this.measuredHeight = typeof hVal === "number" ? hVal : 1 + b.height + p.height;
    }
  }

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);

    const contentRect = this.getContentRect();
    const text = this.getTextContent();

    const fgVar = this.focused
      ? "$background"
      : this.active
        ? "$primary"
        : this.computedStyle.color || "default";

    const bgVar = this.focused
      ? "$primary"
      : this.active
        ? "$selectionBg"
        : this.findResolvedBackground();

    let fg = fgVar;
    let bg = bgVar;
    if (App.instance) {
      fg = App.instance.cssResolver.resolveVariable(this, fgVar);
      bg = App.instance.cssResolver.resolveVariable(this, bgVar);
    }

    const style = new Style({
      color: fg,
      background: bg,
      bold: true,
      strikethrough: this.computedStyle.strikethrough,
      link: this.computedStyle.link,
    });

    const indicator = this.active ? "[x]" : "[ ]";
    const displayText = `${indicator} ${text}`;
    const textLen = stringWidth(displayText);

    const x = Math.max(
      contentRect.x,
      contentRect.x + Math.floor((contentRect.width - textLen) / 2),
    );
    const y = Math.max(contentRect.y, contentRect.y + Math.floor((contentRect.height - 1) / 2));

    const segment = new Segment(displayText, style);
    buffer.drawSegment(x, y, segment, contentRect);
  }
}
