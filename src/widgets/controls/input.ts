import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { iconRegistry } from "../../render/icon-registry.ts";
import { Segment, splitGraphemes, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { blendCaretColors, SMOOTH_CARET_TICK, smoothCaretIntensity } from "./caret.ts";
import { normalizeRange } from "./text-selection.ts";
import { FieldValidation, type ValidatableField, type ValidationResult } from "./validation.ts";

export class InputWidget extends Widget implements ValidatableField {
  private _value = "";
  public get value(): string {
    return this._value;
  }
  public set value(val: string) {
    const oldVal = this._value;
    this._value = val;
    this.selectionAnchor = null;
    if (this.cursorCol === oldVal.length) {
      this.cursorCol = val.length;
    } else {
      this.cursorCol = Math.min(this.cursorCol, val.length);
    }
  }

  public declare onChange?: (val: string) => void;
  public placeholder = "";

  // Input Type, Icons, & Validation
  public type: "text" | "password" | "email" = "text";
  public icon = "";
  public suffixIcon = "";

  // ── Validation ──
  public readonly validation: FieldValidation = new FieldValidation(this);
  private _invalidOverride?: boolean;
  /** True when the field has failed validation (or was set invalid manually). */
  public get invalid(): boolean {
    return this._invalidOverride ?? this.validation.invalid;
  }
  /** Manual override; `undefined` defers to the validation result. */
  public set invalid(val: boolean | undefined) {
    this._invalidOverride = val;
  }
  public getValidationValue(): unknown {
    return this.value;
  }
  /** Validators forwarded from props; setter keeps the helper in sync. */
  public get validators() {
    return this.validation.validators;
  }
  public set validators(v: typeof this.validation.validators) {
    this.validation.validators = v ?? [];
  }
  public get validateOn() {
    return this.validation.validateOn;
  }
  public set validateOn(v: typeof this.validation.validateOn) {
    this.validation.validateOn = v;
  }
  /**
   * Forwards to {@link FieldValidation.onValidate}. Installed as an instance
   * accessor in the constructor (mirroring `attachFieldValidation`) because a
   * class accessor cannot override the base `Widget` handler declaration.
   */
  public declare onValidate?: (result: ValidationResult) => void;

  private cursorCol = 0;
  private scrollX = 0;
  /** Selection start (grapheme index); null when nothing is selected. The caret
   * end of the selection is always {@link cursorCol}. */
  private selectionAnchor: number | null = null;

  private _focused = false;
  private blinkInterval: any = null;
  private cursorVisible = true;
  /** Eased fade-blink (default) instead of a hard on/off toggle. Set false for
   * the classic square-wave blink. */
  public smoothCaret = true;
  /** Timestamp the caret last reset to solid, driving the smooth-blink phase. */
  private caretSolidAt = 0;

  constructor() {
    super("input");
    this.focusable = true;
    this.defaultStyle = { height: 3 };

    Object.defineProperty(this, "onValidate", {
      get: () => this.validation.onValidate,
      set: (fn: typeof this.validation.onValidate) => {
        this.validation.onValidate = fn;
      },
      enumerable: true,
    });

    this.onKey = (ev) => {
      this.handleInputKey(ev);
    };
  }

  public override onUnmount(): void {
    this.stopBlinking();
    super.onUnmount();
  }

  private startBlinking() {
    this.cursorVisible = true;
    this.caretSolidAt = Date.now();
    if (this.blinkInterval) clearInterval(this.blinkInterval);
    if (this.smoothCaret) {
      // Smooth blink: repaint at the animation cadence; the caret's opacity is
      // derived from the elapsed phase in render(), not a boolean toggle.
      this.blinkInterval = setInterval(() => {
        App.instance?.queueRender();
      }, SMOOTH_CARET_TICK);
    } else {
      this.blinkInterval = setInterval(() => {
        this.cursorVisible = !this.cursorVisible;
        App.instance?.queueRender();
      }, 530);
    }
  }

  private stopBlinking() {
    if (this.blinkInterval) {
      clearInterval(this.blinkInterval);
      this.blinkInterval = null;
    }
    this.cursorVisible = false;
  }

  private handleInputKey(ev: any) {
    if (this.focused) {
      this.cursorVisible = true;
      this.startBlinking();
    }

    const originalValue = this.value;
    const contentRect = this.getContentRect();
    const prefixWidth = this.icon ? Math.max(2, stringWidth(this.icon)) + 1 : 0;
    const suffixWidth = this.suffixIcon ? Math.max(2, stringWidth(this.suffixIcon)) + 1 : 0;
    const textWidth = Math.max(1, contentRect.width - prefixWidth - suffixWidth);

    let chars = splitGraphemes(this.value);
    if (this.cursorCol > chars.length) {
      this.cursorCol = chars.length;
    }

    const keyName = ev.name || ev.key;
    const shift = !!ev.shift;

    // Extend the selection when a movement key is pressed with Shift; otherwise
    // a bare movement collapses any existing selection.
    const startSelection = () => {
      if (this.selectionAnchor === null) this.selectionAnchor = this.cursorCol;
    };

    if (keyName === "left") {
      if (shift) {
        startSelection();
        this.cursorCol = Math.max(0, this.cursorCol - 1);
      } else if (this.hasSelection()) {
        this.cursorCol = this.selectionRange()![0];
        this.selectionAnchor = null;
      } else {
        this.cursorCol = Math.max(0, this.cursorCol - 1);
      }
    } else if (keyName === "right") {
      if (shift) {
        startSelection();
        this.cursorCol = Math.min(chars.length, this.cursorCol + 1);
      } else if (this.hasSelection()) {
        this.cursorCol = this.selectionRange()![1];
        this.selectionAnchor = null;
      } else {
        this.cursorCol = Math.min(chars.length, this.cursorCol + 1);
      }
    } else if (keyName === "home") {
      if (shift) startSelection();
      else this.selectionAnchor = null;
      this.cursorCol = 0;
    } else if (keyName === "end") {
      if (shift) startSelection();
      else this.selectionAnchor = null;
      this.cursorCol = chars.length;
    } else if (keyName === "backspace") {
      if (!this.deleteSelectionInto(chars) && this.cursorCol > 0) {
        chars.splice(this.cursorCol - 1, 1);
        this._value = chars.join("");
        this.cursorCol--;
      }
    } else if (keyName === "delete") {
      if (!this.deleteSelectionInto(chars) && this.cursorCol < chars.length) {
        chars.splice(this.cursorCol, 1);
        this._value = chars.join("");
      }
    } else if (keyName === "enter" || keyName === "tab") {
      // ignore control keys
    } else if (ev.key && splitGraphemes(ev.key).length === 1 && !ev.ctrl && !ev.meta) {
      this.deleteSelectionInto(chars);
      chars = splitGraphemes(this._value);
      chars.splice(this.cursorCol, 0, ev.key);
      this._value = chars.join("");
      this.cursorCol++;
    }

    this.keepCursorInView(textWidth, splitGraphemes(this._value).length);

    if (this.value !== originalValue) {
      this.onChange?.(this.value);
      this.validation.maybeValidate("change");
    }
  }

  /** True when a non-empty selection exists. */
  public hasSelection(): boolean {
    return this.selectionAnchor !== null && this.selectionAnchor !== this.cursorCol;
  }

  /** Ordered `[start, end)` selection range, or null when nothing is selected. */
  private selectionRange(): [number, number] | null {
    if (this.selectionAnchor === null || this.selectionAnchor === this.cursorCol) return null;
    return normalizeRange(this.selectionAnchor, this.cursorCol);
  }

  /**
   * If a selection is active, delete it from `chars` (which must reflect the
   * current value), commit the result, collapse the caret to the range start,
   * and return true. Otherwise return false and leave state untouched.
   */
  private deleteSelectionInto(chars: string[]): boolean {
    const range = this.selectionRange();
    if (!range) return false;
    chars.splice(range[0], range[1] - range[0]);
    this._value = chars.join("");
    this.cursorCol = range[0];
    this.selectionAnchor = null;
    return true;
  }

  private keepCursorInView(textWidth: number, length: number): void {
    if (this.cursorCol < this.scrollX) {
      this.scrollX = this.cursorCol;
    } else if (this.cursorCol >= this.scrollX + textWidth) {
      this.scrollX = this.cursorCol - textWidth + 1;
    }
    this.scrollX = Math.max(0, Math.min(Math.max(0, length - textWidth + 1), this.scrollX));
  }

  /** Selected text, or null when nothing is selected. */
  public copySelection(): string | null {
    const range = this.selectionRange();
    if (!range) return null;
    const text = splitGraphemes(this._value).slice(range[0], range[1]).join("");
    App.instance?.driver.clipboard.set(text);
    return text;
  }

  /** Copy the selection, then delete it. No-op when nothing is selected. */
  public cutSelection(): string | null {
    const text = this.copySelection();
    if (text === null) return null;
    const chars = splitGraphemes(this._value);
    this.deleteSelectionInto(chars);
    this.onChange?.(this.value);
    this.validation.maybeValidate("change");
    App.instance?.queueRender();
    return text;
  }

  /** Clear any active selection (caret stays put). */
  public clearSelection(): void {
    this.selectionAnchor = null;
    App.instance?.queueRender();
  }

  /** Select the entire value. */
  public selectAll(): void {
    this.selectionAnchor = 0;
    this.cursorCol = splitGraphemes(this._value).length;
    App.instance?.queueRender();
  }

  /**
   * Replace the selection (or insert at the caret) with `text`. Newlines are
   * flattened to spaces since the single-line input cannot hold them. Used by
   * both keyboard paste and bracketed (native terminal) paste.
   */
  public insertText(text: string): void {
    const sanitized = text.replace(/[\r\n]+/g, " ");
    const originalValue = this._value;
    const chars = splitGraphemes(this._value);
    this.deleteSelectionInto(chars);
    const next = splitGraphemes(this._value);
    next.splice(this.cursorCol, 0, ...splitGraphemes(sanitized));
    this._value = next.join("");
    this.cursorCol += splitGraphemes(sanitized).length;
    this.selectionAnchor = null;
    if (this._value !== originalValue) {
      this.onChange?.(this.value);
      this.validation.maybeValidate("change");
    }
    App.instance?.queueRender();
  }

  /** Map a screen x to a caret index within the value. */
  private colAtX(x: number): number {
    const contentRect = this.getContentRect();
    const prefixWidth = this.icon ? Math.max(2, stringWidth(this.icon)) + 1 : 0;
    const absoluteCol = this.scrollX + (x - (contentRect.x + prefixWidth));
    return Math.max(0, Math.min(splitGraphemes(this.value).length, absoluteCol));
  }

  public override handleMouse(ev: any): void {
    super.handleMouse(ev);
    if (ev.handled) return;

    if (ev.button === "left" && (ev.type === "press" || ev.type === "drag")) {
      const col = this.colAtX(ev.x);
      if (ev.type === "press") {
        // Begin a (possibly empty) selection anchored at the click point.
        this.cursorCol = col;
        this.selectionAnchor = col;
      } else {
        // Drag extends the caret end of the selection; the anchor stays put.
        this.cursorCol = col;
      }
      this.cursorVisible = true;
      this.startBlinking();
      App.instance?.queueRender();
    } else if (ev.type === "release" && ev.button === "left") {
      // A drag-release with a real selection copies it (works on every terminal,
      // including those without the Kitty keyboard protocol for Ctrl+Shift+C).
      if (this.hasSelection()) {
        this.copySelection();
      } else {
        this.selectionAnchor = null;
      }
    }
  }

  public override render(buffer: ScreenBuffer): void {
    if (this.focused !== this._focused) {
      this._focused = this.focused;
      if (this.focused) {
        this.startBlinking();
      } else {
        this.stopBlinking();
        this.validation.maybeValidate("blur");
      }
    }

    if (this.computedStyle.border === undefined) {
      this.computedStyle.border = "rounded";
    }

    // Apply severity border color (error/warning) when validation fails.
    const severityColor = this.validation.resolveColor();
    if (this._invalidOverride && App.instance) {
      this.computedStyle.borderColor =
        App.instance.cssResolver.resolveVariable(this, "$error") || "red";
    } else if (severityColor) {
      this.computedStyle.borderColor = severityColor;
    }

    super.render(buffer);

    const contentRect = this.getContentRect();
    const prefixWidth = this.icon ? Math.max(2, stringWidth(this.icon)) + 1 : 0;
    const suffixWidth = this.suffixIcon ? Math.max(2, stringWidth(this.suffixIcon)) + 1 : 0;
    const textWidth = Math.max(1, contentRect.width - prefixWidth - suffixWidth);

    const chars = splitGraphemes(this.value);
    if (this.cursorCol > chars.length) {
      this.cursorCol = chars.length;
    }

    const fg = this.isDisabled()
      ? App.instance?.cssResolver.resolveVariable(this, "$disabled") || "gray"
      : this.computedStyle.color || "default";
    const bg = this.findResolvedBackground();
    const style = new Style({ color: fg, background: bg });

    // Draw prefix icon if defined
    if (this.icon) {
      const iconColor =
        this.validation.resolveColor() ??
        (this._invalidOverride && App.instance
          ? App.instance.cssResolver.resolveVariable(this, "$error") || "red"
          : fg);
      const iconStyle = new Style({ color: iconColor, background: bg });
      const regIcon = iconRegistry.get(this.icon);

      if (regIcon) {
        buffer.cells[contentRect.y][contentRect.x] = {
          char: regIcon.textFallback,
          style: iconStyle,
          wideContinuation: false,
          icon: this.icon,
        };
        if (contentRect.x + 1 < buffer.width) {
          buffer.cells[contentRect.y][contentRect.x + 1] = {
            char: "",
            style: iconStyle,
            wideContinuation: true,
          };
        }
      } else {
        buffer.drawSegment(
          contentRect.x,
          contentRect.y,
          new Segment(this.icon, iconStyle),
          contentRect,
        );
        if (stringWidth(this.icon) === 1) {
          buffer.setCell(contentRect.x + 1, contentRect.y, " ", style);
        }
      }

      // Draw space after icon
      const spaceX = contentRect.x + (regIcon ? 2 : Math.max(2, stringWidth(this.icon)));
      buffer.setCell(spaceX, contentRect.y, " ", style);
    }

    // Draw suffix icon if defined
    if (this.suffixIcon) {
      const suffixX = contentRect.right - suffixWidth + 1;
      const iconColor =
        this.validation.resolveColor() ??
        (this._invalidOverride && App.instance
          ? App.instance.cssResolver.resolveVariable(this, "$error") || "red"
          : fg);
      const iconStyle = new Style({ color: iconColor, background: bg });
      const regIcon = iconRegistry.get(this.suffixIcon);

      if (regIcon) {
        buffer.cells[contentRect.y][suffixX] = {
          char: regIcon.textFallback,
          style: iconStyle,
          wideContinuation: false,
          icon: this.suffixIcon,
        };
        if (suffixX + 1 < buffer.width) {
          buffer.cells[contentRect.y][suffixX + 1] = {
            char: "",
            style: iconStyle,
            wideContinuation: true,
          };
        }
      } else {
        buffer.drawSegment(
          suffixX,
          contentRect.y,
          new Segment(this.suffixIcon, iconStyle),
          contentRect,
        );
        if (stringWidth(this.suffixIcon) === 1) {
          buffer.setCell(suffixX + 1, contentRect.y, " ", style);
        }
      }
    }

    // Prepare text cells
    const cells: { char: string; style: Style }[] = [];

    if (this.value === "" && this.placeholder) {
      const phColor = App.instance?.cssResolver.resolveVariable(this, "$placeholder") || "gray";
      const placeholderStyle = new Style({ color: phColor, background: bg });
      const phChars = splitGraphemes(this.placeholder);
      for (const char of phChars) {
        cells.push({ char, style: placeholderStyle });
      }
    } else {
      const valChars = splitGraphemes(this.value);
      const displayValue = this.type === "password" ? "•".repeat(valChars.length) : this.value;
      const displayChars = splitGraphemes(displayValue);
      for (const char of displayChars) {
        cells.push({ char, style });
      }
    }

    // Highlight the selected range (value chars map 1:1 to display cells, even
    // for password bullets). Drawn before the cursor so the caret stays visible.
    const selRange = this.selectionRange();
    if (selRange) {
      const selBg = App.instance?.cssResolver.resolveVariable(this, "$selectionBg") || "#585b70";
      const selFg = App.instance?.cssResolver.resolveVariable(this, "$selectionFg") || fg;
      const selStyle = new Style({ color: selFg, background: selBg });
      for (let i = selRange[0]; i < selRange[1] && i < cells.length; i++) {
        cells[i].style = selStyle;
      }
    }

    // Add cursor styling
    if (this.focused && (this.cursorVisible || this.smoothCaret)) {
      const focusColor = App.instance?.cssResolver.resolveVariable(this, "$focus") || fg;
      // Smooth caret: opacity eases through the blink phase. Hard caret: fully
      // lit while visible (the interval toggles `cursorVisible`).
      const intensity = this.smoothCaret ? smoothCaretIntensity(Date.now() - this.caretSolidAt) : 1;
      if (this.cursorCol === cells.length) {
        const c = blendCaretColors(intensity, focusColor, bg, fg, true);
        cells.push({ char: "█", style: new Style(c) });
      } else if (this.cursorCol < cells.length) {
        const cellFg = cells[this.cursorCol].style.color || fg;
        const c = blendCaretColors(intensity, focusColor, bg, cellFg, false);
        cells[this.cursorCol].style = new Style(c);
      }
    }

    // Safely collect cells to draw within terminal text width (prevent wide char overflow)
    let currentWidth = 0;
    let cellIndex = this.scrollX;
    const visibleCells: typeof cells = [];
    while (cellIndex < cells.length && currentWidth < textWidth) {
      const cell = cells[cellIndex];
      const cellW = stringWidth(cell.char);
      if (currentWidth + cellW > textWidth) {
        break;
      }
      visibleCells.push(cell);
      currentWidth += cellW;
      cellIndex++;
    }

    let drawX = contentRect.x + prefixWidth;
    for (const cell of visibleCells) {
      if (drawX >= contentRect.right - suffixWidth + 1) break;
      buffer.setCell(drawX, contentRect.y, cell.char, cell.style);
      drawX += stringWidth(cell.char);
    }
  }
}
