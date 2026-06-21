import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import { Spacing } from "../../geometry/spacing.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { contrastText } from "../../render/color.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { isFormWidget } from "./form.ts";

export class ButtonWidget extends Widget {
  protected override defaultCursor() {
    return "pointer" as const;
  }

  /** Submits or resets the nearest ancestor form when the button activates. */
  public formAction?: "submit" | "reset";

  constructor() {
    super("button");
    this.focusable = true;
    this.defaultStyle = { height: 1, padding: new Spacing(0, 1, 0, 1) };
    this.onKey = (ev) => {
      const keyName = ev.name || ev.key;
      if (keyName === "enter" || keyName === "space" || keyName === " ") {
        if (this.onClick) {
          this.onClick(ev);
        }
        this.triggerFormAction();
        ev.handled = true;
      }
    };
  }

  public override handleMouse(ev: any): void {
    super.handleMouse(ev);
    if (ev.handled) return;
    // Run the form action on click; `onClick` is dispatched separately by the app
    // (we leave `ev.handled` unset so focus + onClick still fire).
    if (ev.type === "press" && ev.button === "left") {
      this.triggerFormAction();
    }
  }

  /** Walks up to the nearest form (duck-typed) and invokes the action. */
  private triggerFormAction(): void {
    if (!this.formAction) return;
    let cur = this.parent;
    while (cur) {
      if (cur instanceof Widget && isFormWidget(cur)) {
        this.formAction === "reset" ? cur.reset() : cur.submit();
        return;
      }
      cur = cur.parent;
    }
  }

  public render(buffer: ScreenBuffer): void {
    super.render(buffer);

    const contentRect = this.getContentRect();
    const text = this.getTextContent();
    if (!text) return;

    // A button needs its own surface to read as a control. Focused: a filled
    // accent (primary). Unfocused: a raised neutral (panel) chrome — never the
    // parent's own background, which would make the button vanish (notably on
    // light themes). An explicit background still wins so callers can theme a
    // button (e.g. a destructive `$error` button).
    // Disabled: a flat muted chrome (panel fill, dimmed text) with no focus
    // accent — it reads as inert and isn't interactive.
    const disabled = this.isDisabled();
    const explicitBg = this.computedStyle.background;
    const hasExplicitBg = explicitBg !== undefined && explicitBg !== "default";
    // The button's own resting colour: an explicit background (e.g. a `$error`
    // destructive button), the accent for a default button, or panel chrome.
    const baseBg = hasExplicitBg ? (explicitBg as string) : "$primary";
    // Focused buttons glow *their own* colour — pulsing from the base toward a
    // contrast pole and back, so a red button glows red, a green one green,
    // rather than every button turning the same accent. Disabled/unfocused sit
    // flat. A 1-row button has no border to ring, so the surface is the signal.
    // When focused, the bg glows the button's own colour and the fg is paired to
    // it — easing light→dark as the fill brightens (a smooth transition, not a
    // hard flip at a luminance threshold). Unfocused/disabled sit flat.
    let bg = disabled ? "$panel" : hasExplicitBg ? (explicitBg as string) : "$panel";
    let glowFg: string | null = null;
    if (App.instance) {
      if (this.focused && !disabled) {
        const pair = App.instance.cssResolver.focusGlowPair(this, baseBg);
        bg = pair.bg;
        glowFg = pair.fg;
      } else {
        bg = App.instance.cssResolver.resolveVariable(this, bg);
      }
    }

    // Text colour: explicit `color` wins, disabled is muted, a focused button
    // uses its paired glow colour, else a static contrast of the fill.
    let fg: string;
    if (disabled) {
      fg = App.instance?.cssResolver.resolveVariable(this, "$disabled") ?? "#8a8a8a";
    } else if (this.computedStyle.color) {
      fg = App.instance?.cssResolver.resolveVariable(this, this.computedStyle.color) ?? "#ffffff";
    } else {
      fg = glowFg ?? contrastText(bg);
    }

    const style = this.cachedStyle({
      color: fg,
      background: bg,
      // Bold only when *not* focused: the breathing focus fill already carries the
      // emphasis, so dropping bold there avoids the over-loud "fill + bold" stack.
      bold: !disabled && !this.focused,
      strikethrough: this.computedStyle.strikethrough,
      link: this.computedStyle.link,
    });

    // Paint the whole button surface with `bg`, not just the text cells, so the
    // focus accent (and its breathing) fills the entire control rather than
    // highlighting only the label.
    const fillStyle = this.cachedStyle({ background: bg });
    const fillRect = this.getClientRect();
    for (let fy = fillRect.y; fy < fillRect.bottom; fy++) {
      for (let fx = fillRect.x; fx < fillRect.right; fx++) {
        buffer.setCell(fx, fy, " ", fillStyle);
      }
    }

    const textLen = stringWidth(text);
    const x = Math.max(
      contentRect.x,
      contentRect.x + Math.floor((contentRect.width - textLen) / 2),
    );
    const y = Math.max(contentRect.y, contentRect.y + Math.floor((contentRect.height - 1) / 2));

    const segment = new Segment(text, style);
    buffer.drawSegment(x, y, segment, contentRect);
  }
}
