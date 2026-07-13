import { App } from "../../core/app.ts";
import type { AccessibleNode } from "../../dom/widget.ts";
import { Widget } from "../../dom/widget.ts";
import { parseDimension } from "../../layout/layout.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment } from "../../render/segment.ts";
import { attachFieldValidation, type FieldValidation } from "./validation.ts";

export class SliderWidget extends Widget {
  protected override defaultCursor() {
    return "pointer" as const;
  }

  /** Current value. */
  public value = 0;
  /** Minimum value. */
  public min = 0;
  /** Maximum value. */
  public max = 100;
  /** Increment per step. */
  public step = 1;
  public declare onChange?: (val: number) => void;

  /** Validation; the validated value is the numeric `value`. */
  public readonly validation: FieldValidation = attachFieldValidation(this, () => this.value);

  /**
   * Whether a drag is in progress, started by a press on the track. A drag only
   * scrubs the value once it begins with a press here — otherwise hover motion on
   * terminals that stream all-motion events (e.g. Ghostty via mode 1003) would be
   * mistaken for a scrub and change the value without a click.
   */
  private dragging = false;

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

      this.commit(newValue);
      ev.handled = true;
    };
  }

  /** Sets the value, firing onChange + change-triggered validation once. */
  private commit(newValue: number): void {
    if (newValue === this.value) return;
    this.value = newValue;
    this.onChange?.(newValue);
    this.validation.maybeValidate("change");
    // The thumb moves within a fixed-size track — geometry-stable, so scope the
    // repaint to the slider (verified; falls back to full if a label resized it).
    (this.app ?? App.instance)?.queueRepaintWidget(this, "slider:change");
  }

  public override handleMouse(ev: any): void {
    super.handleMouse(ev);
    if (ev.handled) return;

    // A press on the track starts a drag; a drag only scrubs while that press is
    // held. Hover motion (a buttonless "move", or an all-motion event some
    // terminals misreport) never starts a drag, so it can't change the value.
    if (ev.type === "release") {
      this.dragging = false;
      return;
    }
    if (ev.type === "press") {
      this.dragging = true;
    } else if (ev.type !== "drag" || !this.dragging) {
      return;
    }

    const contentRect = this.getContentRect();
    const pctWidth = 7; // room for " [100%]"
    const trackWidth = Math.max(5, contentRect.width - pctWidth);

    const clickCol = ev.x - contentRect.x;
    const pct = Math.max(0, Math.min(1, clickCol / (trackWidth - 1)));
    const rawVal = this.min + pct * (this.max - this.min);
    // A zero (or negative) step has no meaningful snapping — treat it as
    // "no stepping" instead of dividing by it, which would set `value` to
    // NaN and corrupt every subsequent render/onChange until the widget is
    // recreated.
    const steppedVal = this.step > 0 ? Math.round(rawVal / this.step) * this.step : rawVal;
    const finalVal = Math.max(this.min, Math.min(this.max, steppedVal));

    this.commit(finalVal);
    ev.handled = true;
  }

  public override getAccessibleNode(): AccessibleNode | null {
    const base = super.getAccessibleNode();
    if (!base) return null;
    return {
      ...base,
      role: "slider",
      value: String(this.value),
      state: [...(base.state ?? []), `range ${this.min}-${this.max}`, `step ${this.step}`],
    };
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
    const disabled = this.isDisabled();
    const disabledColor = App.instance?.cssResolver.resolveVariable(this, "$disabled") || fg;

    const sliderBg = this.focused ? selectBg : bg;

    const pctWidth = 7; // room for " [100%]"
    const trackWidth = Math.max(5, contentRect.width - pctWidth);

    // Calculate slider percentage position
    const range = this.max - this.min;
    const currentPct = range === 0 ? 0 : (this.value - this.min) / range;
    const knobPos = Math.round(currentPct * (trackWidth - 1));

    // Colors. Focused: the *whole* filled bar (not just the knob) glows with the
    // breathing $focus accent, so the value reads as actively focused.
    const activeStyle = this.cachedStyle({
      color: disabled ? disabledColor : this.focused ? displayColor : primaryColor,
      background: sliderBg,
    });
    const inactiveStyle = this.cachedStyle({
      color: disabled ? disabledColor : this.focused ? "lightgray" : "gray",
      background: sliderBg,
    });
    const knobStyle = this.cachedStyle({
      // Focused: the handle breathes with the $focus accent (displayColor); the
      // knob stays bold as the value's anchor point.
      color: disabled ? disabledColor : this.focused ? displayColor : primaryColor,
      background: sliderBg,
      bold: true,
    });

    // Draw horizontal track background if focused
    if (this.focused) {
      for (let x = contentRect.x; x < contentRect.right; x++) {
        buffer.setCell(x, contentRect.y, " ", this.cachedStyle({ background: selectBg }));
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
        this.cachedStyle({
          color: this.focused ? selectFg : displayColor,
          background: sliderBg,
        }),
      ),
      contentRect,
    );
  }
}
