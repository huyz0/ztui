import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import { parseDimension } from "../../layout/layout.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { attachFieldValidation, type FieldValidation } from "./validation.ts";

export class SwitchWidget extends Widget {
  public active = false;
  public label = "";
  public declare onChange?: (val: boolean) => void;

  /** Validation; the validated value is the boolean `active` state. */
  public readonly validation: FieldValidation = attachFieldValidation(this, () => this.active);

  constructor() {
    super("switch");
    this.focusable = true;
    this.defaultStyle = { height: 1 };

    this.onKey = (ev) => {
      const keyName = ev.name || ev.key;
      if (keyName === "space" || keyName === " " || keyName === "enter") {
        this.toggle();
        ev.handled = true;
      }
    };
  }

  private toggle(): void {
    this.active = !this.active;
    this.onChange?.(this.active);
    this.validation.maybeValidate("change");
  }

  public override handleMouse(ev: any): void {
    super.handleMouse(ev);
    if (ev.handled) return;

    if (ev.type === "press" && ev.button === "left") {
      this.toggle();
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
    const severityColor = this.validation.resolveColor();
    if (severityColor) displayColor = severityColor;

    const primaryColor = App.instance?.cssResolver.resolveVariable(this, "$primary") || "cyan";
    const disabled = this.isDisabled();
    const disabledColor = App.instance?.cssResolver.resolveVariable(this, "$disabled") || fg;

    const style = new Style({
      color: disabled ? disabledColor : this.active ? primaryColor : displayColor,
      background: bg,
      bold: this.focused && !disabled,
    });

    const track = this.active ? "[ ●]" : "[● ]";
    const text = `${track} ${this.label}`;
    const segment = new Segment(text, style);
    buffer.drawSegment(contentRect.x, contentRect.y, segment, contentRect);
  }
}
