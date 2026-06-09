import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import { parseDimension } from "../../layout/layout.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";

export class SwitchWidget extends Widget {
  public active = false;
  public label = "";
  public onChange?: (val: boolean) => void;

  constructor() {
    super("switch");
    this.focusable = true;
    this.defaultStyle = { height: 1 };

    this.onKey = (ev) => {
      const keyName = ev.name || ev.key;
      if (keyName === "space" || keyName === " " || keyName === "enter") {
        this.active = !this.active;
        this.onChange?.(this.active);
        ev.handled = true;
      }
    };
  }

  public override handleMouse(ev: any): void {
    super.handleMouse(ev);
    if (ev.handled) return;

    if (ev.type === "press" && ev.button === "left") {
      this.active = !this.active;
      this.onChange?.(this.active);
      App.instance?.queueRender();
    }
  }

  public override measure(maxW: number, maxH: number): void {
    const b = this.borderSize;
    const p = this.padding;
    const textLen = 6 + stringWidth(this.label); // "[● ] " is 5 chars + label

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

    const fg = this.computedStyle.color || "default";
    const bg = this.findResolvedBackground();

    let displayColor = fg;
    if (this.focused) {
      displayColor = App.instance?.cssResolver.resolveVariable(this, "$focus") || fg;
    }

    const primaryColor = App.instance?.cssResolver.resolveVariable(this, "$primary") || "cyan";
    const _disabledColor = "gray";

    const style = new Style({
      color: this.active ? primaryColor : displayColor,
      background: bg,
      bold: this.focused,
    });

    const track = this.active ? "[ ●]" : "[● ]";
    const text = `${track} ${this.label}`;
    const segment = new Segment(text, style);
    buffer.drawSegment(contentRect.x, contentRect.y, segment, contentRect);
  }
}
