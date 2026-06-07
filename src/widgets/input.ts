import { Widget } from "../dom/widget.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { Segment } from "../render/segment.ts";
import { Style } from "../render/style.ts";

export class InputWidget extends Widget {
  public value = "";
  public onChange?: (val: string) => void;

  constructor() {
    super("input");
    this.focusable = true;
    this.defaultStyle = { height: 3 };

    this.onKey = (ev) => {
      if (ev.key === "backspace") {
        this.value = this.value.slice(0, -1);
        if (this.onChange) this.onChange(this.value);
      } else if (ev.key === "enter" || ev.key === "tab") {
        // ignore control keys
      } else if (ev.key.length === 1) {
        this.value += ev.key;
        if (this.onChange) this.onChange(this.value);
      }
    };
  }

  public render(buffer: ScreenBuffer): void {
    if (this.computedStyle.border === undefined) {
      this.computedStyle.border = "solid";
    }
    super.render(buffer);

    const contentRect = this.getContentRect();

    let displayVal = this.value;
    if (this.focused) {
      displayVal += "█";
    }

    const fg = this.computedStyle.color || "default";
    const bg = this.computedStyle.background || "default";
    const style = new Style({ color: fg, background: bg });

    const segment = new Segment(displayVal, style);
    buffer.drawSegment(contentRect.x, contentRect.y, segment, contentRect);
  }
}
