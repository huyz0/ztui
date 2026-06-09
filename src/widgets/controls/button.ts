import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import { Spacing } from "../../geometry/spacing.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";

export class ButtonWidget extends Widget {
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
      const f = cur as any;
      if (f?.isForm === true && typeof f.submit === "function") {
        this.formAction === "reset" ? f.reset() : f.submit();
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

    let fg = this.focused ? "$background" : this.computedStyle.color || "default";
    let bg = this.focused ? "$primary" : this.findResolvedBackground();

    if (App.instance) {
      fg = App.instance.cssResolver.resolveVariable(this, fg);
      bg = App.instance.cssResolver.resolveVariable(this, bg);
    }

    const style = new Style({
      color: fg,
      background: bg,
      bold: true,
      strikethrough: this.computedStyle.strikethrough,
      link: this.computedStyle.link,
    });

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
