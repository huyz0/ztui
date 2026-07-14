import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import { parseDimension } from "../../layout/layout.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { attachFieldValidation, type FieldValidation } from "./validation.ts";

export class CheckboxWidget extends Widget {
  protected override defaultCursor() {
    return "pointer" as const;
  }

  /** Checked state. */
  public checked = false;
  public label = "";
  public declare onChange?: (val: boolean) => void;

  /** Validation; the validated value is the boolean `checked` state. */
  public readonly validation: FieldValidation = attachFieldValidation(this, () => this.checked);

  constructor() {
    super("checkbox");
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
    this.checked = !this.checked;
    this.onChange?.(this.checked);
    this.validation.maybeValidate("change");
  }

  public override handleMouse(ev: any): void {
    super.handleMouse(ev);
    if (ev.handled) return;

    if (ev.type === "press" && ev.button === "left") {
      this.toggle();
      // The marker is a fixed-width glyph swap (☑/☐) — geometry-stable — so a
      // scoped repaint re-renders just this checkbox, not the whole tree. The
      // verification falls back to a full frame if a :checked rule ever resizes it.
      (this.app ?? App.instance)?.queueRepaintWidget(this, "checkbox:toggle");
    }
  }

  public override measure(maxW: number, maxH: number): void {
    const b = this.borderSize;
    const p = this.padding;
    const textLen = 2 + stringWidth(this.label); // "☑ " or "☐ " is 2 characters + label

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
    // Validation severity recolors the marker + label (these controls are
    // border-less, so color is the in-place signal).
    const severityColor = this.validation.resolveColor();
    if (severityColor) displayColor = severityColor;

    const primaryColor = App.instance?.cssResolver.resolveVariable(this, "$primary") || "cyan";
    const disabled = this.isDisabled();
    const disabledColor = App.instance?.cssResolver.resolveVariable(this, "$disabled") || fg;

    const marker = this.checked ? "☑" : "☐";

    // A focused, valid checkbox is borderless, so focus is shown as a breathing
    // band behind the whole control (like a highlighted row) — far more visible
    // than tinting the label alone. Text/marker flip to a contrasting colour so
    // they stay legible as the band glows.
    const focusBand = this.focused && !disabled && !severityColor;
    let rowBg = bg;
    let markerColor = disabled ? disabledColor : this.checked ? primaryColor : displayColor;
    let labelColor = markerColor;
    if (focusBand && App.instance) {
      // Band bg glows; text colour eases in lockstep (smooth, not a hard flip).
      const pair = App.instance.cssResolver.focusGlowPair(this, "$selectionBg");
      rowBg = pair.bg;
      labelColor = pair.fg;
      markerColor = labelColor;
      const client = this.getClientRect();
      const bandStyle = this.cachedStyle({ background: rowBg });
      for (let y = client.y; y < client.bottom; y++) {
        for (let x = client.x; x < client.right; x++) buffer.setCell(x, y, " ", bandStyle);
      }
    }

    const markerSeg = new Segment(
      `${marker} `,
      this.cachedStyle({ color: markerColor, background: rowBg }),
    );
    const labelSeg = new Segment(
      this.label,
      this.cachedStyle({ color: labelColor, background: rowBg }),
    );
    buffer.drawSegment(contentRect.x, contentRect.y, markerSeg, contentRect);
    buffer.drawSegment(
      contentRect.x + stringWidth(`${marker} `),
      contentRect.y,
      labelSeg,
      contentRect,
    );
  }
}
