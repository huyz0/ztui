import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import { parseDimension } from "../../layout/layout.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import type { FormWidget } from "./form.ts";
import { FieldValidation, type ValidatableField } from "./validation.ts";

function isField(w: Widget): w is ValidatableField {
  return (w as any).validation instanceof FieldValidation;
}

/**
 * Lists every currently-invalid field in a form, one message per row, and lets
 * the user jump to a field (↑/↓ then Enter, or click). Collapses to zero height
 * when the form is valid.
 *
 * Intended for tall or scrollable forms where a per-field inline message or the
 * shared status line isn't enough to see everything wrong at once. Binds to the
 * nearest ancestor `<Form>`, or to `formId` when set.
 */
export class ValidationSummaryWidget extends Widget {
  public formId?: string;
  /** Optional heading row shown above the messages when there are errors. */
  public title = "";
  /** Prefix glyph drawn before each message. */
  public bullet = "• ";
  private selectedIndex = 0;

  constructor() {
    super("validation-summary");
    this.focusable = true;
    this.defaultStyle = { width: "100%" };

    this.onKey = (ev) => {
      const items = this.invalidFields();
      if (items.length === 0) return;
      const keyName = ev.name || ev.key;
      if (keyName === "up") {
        this.selectedIndex = Math.max(0, this.selectedIndex - 1);
        ev.handled = true;
      } else if (keyName === "down") {
        this.selectedIndex = Math.min(items.length - 1, this.selectedIndex + 1);
        ev.handled = true;
      } else if (keyName === "enter" || keyName === "space" || keyName === " ") {
        this.jumpTo(items[this.selectedIndex]);
        ev.handled = true;
      }
      App.instance?.queueRender();
    };
  }

  public override handleMouse(ev: any): void {
    super.handleMouse(ev);
    if (ev.handled) return;
    if (ev.type === "press" && ev.button === "left") {
      const items = this.invalidFields();
      const rect = this.getContentRect();
      const row = ev.y - rect.y - (this.title ? 1 : 0);
      if (row >= 0 && row < items.length) {
        this.selectedIndex = row;
        this.jumpTo(items[row]);
        App.instance?.queueRender();
      }
    }
  }

  private jumpTo(field: ValidatableField): void {
    App.instance?.activeScreen?.focusWidget(field);
    App.instance?.queueRender();
  }

  /** Resolves the bound form: `formId` if set, else nearest ancestor form. */
  private form(): FormWidget | null {
    if (this.formId) {
      let root: Widget = this;
      while (root.parent instanceof Widget) root = root.parent;
      return this.findForm(root, this.formId);
    }
    let cur = this.parent;
    while (cur) {
      if ((cur as any).isForm === true) return cur as FormWidget;
      cur = cur.parent;
    }
    return null;
  }

  private findForm(w: Widget, id: string): FormWidget | null {
    if (w.id === id && (w as any).isForm === true) return w as FormWidget;
    for (const c of w.children) {
      if (c instanceof Widget) {
        const found = this.findForm(c, id);
        if (found) return found;
      }
    }
    return null;
  }

  /** Invalid fields with a message, in document order. */
  private invalidFields(): ValidatableField[] {
    const form = this.form();
    const fields = form ? form.collectFields() : this.descendantFields();
    return fields.filter((f) => f.validation.message);
  }

  private descendantFields(): ValidatableField[] {
    const out: ValidatableField[] = [];
    const walk = (w: Widget) => {
      for (const c of w.children) {
        if (c instanceof Widget) {
          if (isField(c)) out.push(c);
          walk(c);
        }
      }
    };
    walk(this);
    return out;
  }

  public override measure(maxW: number, _maxH: number): void {
    const wVal = parseDimension(this.computedStyle.width ?? "100%", maxW, -1);
    this.measuredWidth = typeof wVal === "number" ? wVal : maxW;
    const count = this.invalidFields().length;
    this.measuredHeight = count === 0 ? 0 : count + (this.title ? 1 : 0);
  }

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
    const items = this.invalidFields();
    if (items.length === 0) return;
    if (this.selectedIndex >= items.length) this.selectedIndex = items.length - 1;

    const rect = this.getContentRect();
    const bg = this.findResolvedBackground();
    const errorColor = App.instance?.cssResolver.resolveVariable(this, "$error") || "red";
    const selectBg = App.instance?.cssResolver.resolveVariable(this, "$selectionBg") || "blue";

    let y = rect.y;
    if (this.title) {
      buffer.drawSegment(
        rect.x,
        y,
        new Segment(this.title, new Style({ color: errorColor, background: bg, bold: true })),
        rect,
      );
      y += 1;
    }

    for (let i = 0; i < items.length && y <= rect.bottom; i++, y++) {
      const field = items[i];
      const selected = this.focused && i === this.selectedIndex;
      const rowBg = selected ? selectBg : bg;
      const color = field.validation.resolveColor() || errorColor;
      if (selected) {
        for (let x = rect.x; x < rect.right; x++)
          buffer.setCell(x, y, " ", new Style({ background: rowBg }));
      }
      let text = `${this.bullet}${field.validation.message ?? ""}`;
      if (stringWidth(text) > rect.width) {
        while (text.length > 1 && stringWidth(`${text}…`) > rect.width) text = text.slice(0, -1);
        text = `${text}…`;
      }
      buffer.drawSegment(
        rect.x,
        y,
        new Segment(text, new Style({ color, background: rowBg })),
        rect,
      );
    }
  }
}
