import { Widget } from "../../dom/widget.ts";
import { parseDimension } from "../../layout/layout.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { isValidatableField, type ValidatableField } from "./validation.ts";

/**
 * Inline, per-field error message. Collapses to **zero height** while its field
 * is valid, so a valid form never reserves space for messages and the layout
 * doesn't jump until an error actually appears.
 *
 * By default it reports on the nearest preceding sibling field; set `targetId`
 * to bind to a specific field by id.
 */
export class FieldErrorWidget extends Widget {
  /** Id of the field this message is bound to. */
  public targetId?: string;

  constructor() {
    super("field-error");
    this.defaultStyle = { width: "100%" };
  }

  /** Resolves the field this message reports on. */
  private target(): ValidatableField | null {
    if (this.targetId) {
      const root = this.parent ? this.rootOf(this) : this;
      return this.findById(root, this.targetId);
    }
    // Nearest preceding sibling that is a validatable field.
    const siblings = (this.parent?.children ?? []) as Widget[];
    const idx = siblings.indexOf(this);
    for (let i = idx - 1; i >= 0; i--) {
      const s = siblings[i];
      if (s instanceof Widget && isValidatableField(s)) return s;
    }
    return null;
  }

  private rootOf(w: Widget): Widget {
    let cur: Widget = w;
    while (cur.parent instanceof Widget) cur = cur.parent;
    return cur;
  }

  private findById(w: Widget, id: string): ValidatableField | null {
    if (w.id === id && isValidatableField(w)) return w;
    for (const c of w.children) {
      if (c instanceof Widget) {
        const found = this.findById(c, id);
        if (found) return found;
      }
    }
    return null;
  }

  private message(): string | undefined {
    return this.target()?.validation.message;
  }

  public override measure(maxW: number, _maxH: number): void {
    const wVal = parseDimension(this.computedStyle.width ?? "100%", maxW, -1);
    this.measuredWidth = typeof wVal === "number" ? wVal : maxW;
    // Zero rows unless there is a message to show.
    this.measuredHeight = this.message() ? 1 : 0;
  }

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
    const msg = this.message();
    if (!msg) return;
    const rect = this.getContentRect();
    if (rect.height < 1 || rect.width < 1) return;
    const color = this.target()?.validation.resolveColor() || "red";
    const bg = this.findResolvedBackground();
    let text = msg;
    if (stringWidth(text) > rect.width) {
      while (text.length > 1 && stringWidth(`${text}…`) > rect.width) text = text.slice(0, -1);
      text = `${text}…`;
    }
    buffer.drawSegment(
      rect.x,
      rect.y,
      new Segment(text, this.cachedStyle({ color, background: bg })),
      rect,
    );
  }
}
