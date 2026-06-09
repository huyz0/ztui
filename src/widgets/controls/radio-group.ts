import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import { parseDimension } from "../../layout/layout.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { attachFieldValidation, type FieldValidation } from "./validation.ts";

export interface RadioOption {
  label: string;
  value: string;
}

export class RadioGroupWidget extends Widget {
  public options: (string | RadioOption)[] = [];
  public value = "";
  public orientation: "horizontal" | "vertical" = "vertical";
  public onChange?: (val: string) => void;

  public hoveredIndex = 0;

  /** Validation; the validated value is the selected option's value. */
  public readonly validation: FieldValidation = attachFieldValidation(this, () => this.value);

  constructor() {
    super("radio-group");
    this.focusable = true;
    this.defaultStyle = {};

    this.onKey = (ev) => {
      this.handleRadioKey(ev);
    };
  }

  /** Selects a value, firing onChange + change-triggered validation once. */
  private commit(selected: string): void {
    if (this.value === selected) return;
    this.value = selected;
    this.onChange?.(selected);
    this.validation.maybeValidate("change");
  }

  public getResolvedOptions(): RadioOption[] {
    return this.options.map((opt) => {
      if (typeof opt === "string") {
        return { label: opt, value: opt };
      }
      return opt;
    });
  }

  private handleRadioKey(ev: any) {
    const keyName = ev.name || ev.key;
    const resolved = this.getResolvedOptions();
    if (resolved.length === 0) return;

    if (keyName === "up" || keyName === "left") {
      this.hoveredIndex = Math.max(0, this.hoveredIndex - 1);
      ev.handled = true;
    } else if (keyName === "down" || keyName === "right") {
      this.hoveredIndex = Math.min(resolved.length - 1, this.hoveredIndex + 1);
      ev.handled = true;
    }

    if (keyName === "space" || keyName === " " || keyName === "enter") {
      this.commit(resolved[this.hoveredIndex].value);
      ev.handled = true;
    }
  }

  public override handleMouse(ev: any): void {
    super.handleMouse(ev);
    if (ev.handled) return;

    if (ev.type === "press" && ev.button === "left") {
      const contentRect = this.getContentRect();
      const resolved = this.getResolvedOptions();

      if (this.orientation === "vertical") {
        const clickY = ev.y - contentRect.y;
        if (clickY >= 0 && clickY < resolved.length) {
          this.hoveredIndex = clickY;
          this.commit(resolved[clickY].value);
          App.instance?.queueRender();
        }
      } else {
        // Horizontal click hit-testing based on option widths
        let currentX = contentRect.x;
        for (let i = 0; i < resolved.length; i++) {
          const option = resolved[i];
          const isSelected = this.value === option.value;
          const marker = isSelected ? "●" : "○";
          const text = `${marker} ${option.label}   `;
          const textLen = stringWidth(text);
          if (ev.x >= currentX && ev.x < currentX + textLen) {
            this.hoveredIndex = i;
            this.commit(option.value);
            App.instance?.queueRender();
            break;
          }
          currentX += textLen;
        }
      }
    }
  }

  public override measure(maxW: number, maxH: number): void {
    const resolved = this.getResolvedOptions();
    const b = this.borderSize;
    const p = this.padding;

    let contentWidth = 0;
    let contentHeight = 0;

    if (this.orientation === "vertical") {
      contentHeight = resolved.length;
      for (const opt of resolved) {
        // "● " takes 2 characters + label
        contentWidth = Math.max(contentWidth, 2 + stringWidth(opt.label));
      }
    } else {
      contentHeight = 1;
      for (const opt of resolved) {
        contentWidth += 2 + stringWidth(opt.label) + 3; // +3 for gap
      }
    }

    if (this.computedStyle.width === undefined) {
      this.measuredWidth = contentWidth + b.width + p.width;
    } else {
      const wVal = parseDimension(this.computedStyle.width, maxW, -1);
      this.measuredWidth = typeof wVal === "number" ? wVal : contentWidth + b.width + p.width;
    }

    if (this.computedStyle.height === undefined) {
      this.measuredHeight = contentHeight + b.height + p.height;
    } else {
      const hVal = parseDimension(this.computedStyle.height, maxH, -1);
      this.measuredHeight = typeof hVal === "number" ? hVal : contentHeight + b.height + p.height;
    }
  }

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
    const contentRect = this.getContentRect();
    const resolved = this.getResolvedOptions();

    const bg = this.findResolvedBackground();
    // Recolor the group to the validation severity when invalid (border-less control).
    const fg = this.validation.resolveColor() || this.computedStyle.color || "default";

    const primaryColor = App.instance?.cssResolver.resolveVariable(this, "$primary") || "cyan";
    const selectBg = App.instance?.cssResolver.resolveVariable(this, "$selectionBg") || "blue";
    const selectFg = App.instance?.cssResolver.resolveVariable(this, "$selectionFg") || "white";

    if (this.orientation === "vertical") {
      for (let i = 0; i < resolved.length; i++) {
        const option = resolved[i];
        const isSelected = this.value === option.value;
        const isHovered = i === this.hoveredIndex;

        // Visual circle indicators (standard unicode)
        const marker = isSelected ? "●" : "○";

        let style: Style;
        if (isHovered && this.focused) {
          style = new Style({ color: selectFg, background: selectBg, bold: true });
        } else {
          style = new Style({ color: isSelected ? primaryColor : fg, background: bg });
        }

        const segment = new Segment(`${marker} ${option.label}`, style);

        // Fill full option row if hovered/focused to give a beautiful selection block
        if (isHovered && this.focused) {
          const rowY = contentRect.y + i;
          for (let x = contentRect.x; x < contentRect.right; x++) {
            buffer.setCell(x, rowY, " ", style);
          }
        }

        buffer.drawSegment(contentRect.x, contentRect.y + i, segment, contentRect);
      }
    } else {
      let currentX = contentRect.x;
      for (let i = 0; i < resolved.length; i++) {
        const option = resolved[i];
        const isSelected = this.value === option.value;
        const isHovered = i === this.hoveredIndex;

        const marker = isSelected ? "●" : "○";

        let style: Style;
        if (isHovered && this.focused) {
          style = new Style({ color: selectFg, background: selectBg, bold: true });
        } else {
          style = new Style({ color: isSelected ? primaryColor : fg, background: bg });
        }

        const text = `${marker} ${option.label}`;
        const segment = new Segment(text, style);
        const textLen = stringWidth(text);

        // Fill background of the option block if focused
        if (isHovered && this.focused) {
          for (let x = currentX; x < currentX + textLen + 1; x++) {
            buffer.setCell(x, contentRect.y, " ", style);
          }
        }

        buffer.drawSegment(currentX, contentRect.y, segment, contentRect);
        currentX += textLen + 3;
      }
    }
  }
}
