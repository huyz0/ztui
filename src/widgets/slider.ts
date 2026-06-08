import { App } from "../core/app.ts";
import { Widget } from "../dom/widget.ts";
import { parseDimension } from "../layout/layout.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { Segment } from "../render/segment.ts";
import { Style } from "../render/style.ts";

export class SliderWidget extends Widget {
  public value = 0;
  public min = 0;
  public max = 100;
  public step = 1;
  public onChange?: (val: number) => void;

  constructor() {
    super("slider");
    this.focusable = true;
    this.defaultStyle = { height: 1 };

    this.onKey = (ev) => {
      const keyName = ev.name || ev.key;
      let newValue = this.value;

      if (keyName === "left" || keyName === "down") {
        newValue = Math.max(this.min, this.value - this.step);
      } else if (keyName === "right" || keyName === "up") {
        newValue = Math.min(this.max, this.value + this.step);
      } else {
        return;
      }

      if (newValue !== this.value) {
        this.value = newValue;
        this.onChange?.(newValue);
        App.instance?.queueRender();
      }
      ev.handled = true;
    };
  }

  public override handleMouse(ev: any): void {
    super.handleMouse(ev);
    if (ev.handled) return;

    if (ev.type === "press" || ev.type === "drag") {
      const contentRect = this.getContentRect();
      const pctWidth = 7; // room for " [100%]"
      const trackWidth = Math.max(5, contentRect.width - pctWidth);

      const clickCol = ev.x - contentRect.x;
      const pct = Math.max(0, Math.min(1, clickCol / trackWidth));
      const rawVal = this.min + pct * (this.max - this.min);
      const steppedVal = Math.round(rawVal / this.step) * this.step;
      const finalVal = Math.max(this.min, Math.min(this.max, steppedVal));

      if (finalVal !== this.value) {
        this.value = finalVal;
        this.onChange?.(finalVal);
        App.instance?.queueRender();
      }
      ev.handled = true;
    }
  }

  public override measure(maxW: number, maxH: number): void {
    const b = this.borderSize;
    const p = this.padding;

    // Minimum sensible width is 15 (track of 8 + pct text of 7)
    if (this.computedStyle.width === undefined) {
      this.measuredWidth = 15 + b.width + p.width;
    } else {
      const wVal = parseDimension(this.computedStyle.width, maxW, -1);
      this.measuredWidth = typeof wVal === "number" ? wVal : 15 + b.width + p.width;
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
    const selectBg = App.instance?.cssResolver.resolveVariable(this, "$selectionBg") || "blue";
    const selectFg = App.instance?.cssResolver.resolveVariable(this, "$selectionFg") || "white";

    const sliderBg = this.focused ? selectBg : bg;

    const pctWidth = 7; // room for " [100%]"
    const trackWidth = Math.max(5, contentRect.width - pctWidth);

    // Calculate slider percentage position
    const range = this.max - this.min;
    const currentPct = range === 0 ? 0 : (this.value - this.min) / range;
    const knobPos = Math.round(currentPct * (trackWidth - 1));

    // Colors
    const activeStyle = new Style({
      color: this.focused ? selectFg : primaryColor,
      background: sliderBg,
      bold: this.focused,
    });
    const inactiveStyle = new Style({
      color: this.focused ? "lightgray" : "gray",
      background: sliderBg,
    });
    const knobStyle = new Style({
      color: this.focused ? primaryColor : displayColor,
      background: sliderBg,
      bold: true,
    });

    // Draw horizontal track background if focused
    if (this.focused) {
      for (let x = contentRect.x; x < contentRect.right; x++) {
        buffer.setCell(x, contentRect.y, " ", new Style({ background: selectBg }));
      }
    }

    // Draw horizontal track characters
    for (let i = 0; i < trackWidth; i++) {
      let char = "━";
      let style = activeStyle;
      if (i === knobPos) {
        char = "●";
        style = knobStyle;
      } else if (i > knobPos) {
        char = "─";
        style = inactiveStyle;
      }
      buffer.setCell(contentRect.x + i, contentRect.y, char, style);
    }

    // Draw percentage text
    const percentage = Math.round(currentPct * 100);
    const pctText = ` [${String(percentage).padStart(3)}%]`;
    buffer.drawSegment(
      contentRect.x + trackWidth,
      contentRect.y,
      new Segment(
        pctText,
        new Style({
          color: this.focused ? selectFg : displayColor,
          background: sliderBg,
          bold: this.focused,
        }),
      ),
      contentRect,
    );
  }
}
