import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { truncate } from "../../render/text-wrap.ts";
import { BoxWidget } from "../layout/box.ts";
import { isValidatableField, type ValidatableField } from "./validation.ts";

/** How a form surfaces field error messages, balanced against TUI screen space. */
export type FormMessageMode = "auto" | "shared" | "inline" | "none";

/**
 * A container that coordinates validation across its descendant fields.
 *
 * Layout-wise it is a vertical box. Submission is triggered by a descendant
 * `<Button formAction="submit">` (or an imperative {@link submit} call); on
 * submit every field validates, the first invalid one is focused, and
 * `onSubmit(values)` only fires when all fields pass.
 *
 * Messages are shown space-frugally: in `auto`/`shared` mode the whole form
 * shares a single bottom status line that reflects the focused field, so a dense
 * form never reserves a row per field. `inline` defers to per-field
 * {@link FieldErrorWidget}s; `none` relies on border/icon coloring alone.
 */
export class FormWidget extends BoxWidget {
  /** Duck-typed marker so a Button can find its form without importing it. */
  public readonly isForm = true;
  /** How validation messages are surfaced. */
  public messageMode: FormMessageMode = "auto";
  public declare onSubmit?: (values: Record<string, unknown>) => void;
  public declare onValidate?: (valid: boolean, values: Record<string, unknown>) => void;

  constructor() {
    super();
    this.tagName = "form";
    this.defaultStyle = { layout: "vertical" };
  }

  /** All validatable descendant fields, in document order. */
  public collectFields(): ValidatableField[] {
    const out: ValidatableField[] = [];
    const walk = (w: Widget) => {
      for (const child of w.children) {
        if (child instanceof Widget) {
          if (isValidatableField(child)) out.push(child);
          walk(child);
        }
      }
    };
    walk(this);
    return out;
  }

  /** Current values keyed by field id (falls back to DOM order index). */
  public get values(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    this.collectFields().forEach((f, i) => {
      out[f.id || String(i)] = f.getValidationValue();
    });
    return out;
  }

  /** Validates every field; returns true when all pass. */
  public validate(): boolean {
    const fields = this.collectFields();
    let valid = true;
    for (const f of fields) {
      if (!f.validation.validate().valid) valid = false;
    }
    this.onValidate?.(valid, this.values);
    return valid;
  }

  /** Validates, focuses the first invalid field, and fires onSubmit when valid. */
  public submit(): void {
    const fields = this.collectFields();
    let firstInvalid: ValidatableField | null = null;
    for (const f of fields) {
      if (!f.validation.validate().valid && !firstInvalid) firstInvalid = f;
    }
    if (firstInvalid) {
      App.instance?.activeScreen?.focusWidget(firstInvalid);
      App.instance?.queueRender();
      return;
    }
    this.onSubmit?.(this.values);
  }

  /** Clears validation state on every field (does not clear values). */
  public reset(): void {
    for (const f of this.collectFields()) {
      f.validation.touched = false;
      f.validation.result = { valid: true };
    }
    App.instance?.queueRender();
  }

  /**
   * In `auto`/`shared` mode, reserve one extra row below the fields' natural
   * flow for the shared status line so it never overlaps the last field.
   */
  public override measure(maxW: number, maxH: number): void {
    super.measure(maxW, maxH);
    if (this.messageMode === "auto" || this.messageMode === "shared") {
      this.measuredHeight = Math.min(this.measuredHeight + 1, maxH);
    }
  }

  /** Paints the form container (background/border); fields render themselves. */
  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
    if (this.messageMode !== "auto" && this.messageMode !== "shared") return;

    // Shared status line: show the focused field's message on the form's bottom
    // row so N fields cost at most one row, not one each.
    const focused = this.collectFields().find((f) => f.focused && f.validation.message);
    const msg = focused?.validation.message;
    if (!msg) return;

    const rect = this.getContentRect();
    if (rect.height < 1) return;
    const color = focused?.validation.resolveColor() || "red";
    const bg = this.findResolvedBackground();
    // The reserved row added in measure() is the last row of the content rect.
    const y = rect.bottom - 1;
    // Truncate to fit the available width rather than wrapping onto a new row.
    const text = stringWidth(msg) > rect.width ? truncate(msg, rect.width) : msg;
    buffer.drawSegment(rect.x, y, new Segment(text, new Style({ color, background: bg })), rect);
  }
}

/**
 * Type guard: true when a widget is a {@link FormWidget}. Tests the duck-typed
 * `isForm` marker so callers (Button's form-action lookup, the validation
 * summary) can find the enclosing form without importing the class — avoiding an
 * import cycle while keeping the check in one place.
 */
export function isFormWidget(w: Widget): w is FormWidget {
  return (w as { isForm?: unknown }).isForm === true;
}
