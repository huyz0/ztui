import { App } from "../../core/app.ts";
import { Screen } from "../../dom/screen.ts";
import { Widget } from "../../dom/widget.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { charWidth, Segment, splitGraphemes, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { FALLBACK_DARK_BG } from "../../theme.ts";
import type { SelectOption } from "./select.ts";
import { attachFieldValidation, type FieldValidation } from "./validation.ts";

const MAX_VISIBLE_ROWS = 8;

export class ComboboxOverlayWidget extends Widget {
  protected override defaultCursor() {
    return "pointer" as const;
  }

  constructor(
    public combobox: ComboboxWidget,
    public overlayX: number,
    public overlayY: number,
    public overlayWidth: number,
    /**
     * Caps the painted height below the natural row count when the screen
     * doesn't have room in either direction — otherwise the overlay would
     * still overflow past the screen edge even after {@link ComboboxWidget.openDropdown}
     * picked the side with more (but still insufficient) space.
     */
    private maxHeight = Infinity,
  ) {
    super("combobox-overlay");
    this.focusable = false;
    this.style = {
      position: "absolute",
      left: 0,
      top: 0,
      width: "100%",
      height: "100%",
      zIndex: 1000,
    };
  }

  private overlayHeight(): number {
    const natural =
      Math.min(Math.max(this.combobox.getFilteredOptions().length, 1), MAX_VISIBLE_ROWS) + 2;
    return Math.max(3, Math.min(natural, this.maxHeight));
  }

  /** Rows actually drawn, given the (possibly space-clamped) overlay height. */
  private visibleRows(filtered: SelectOption[]): number {
    return Math.min(filtered.length, MAX_VISIBLE_ROWS, this.overlayHeight() - 2);
  }

  /** First filtered-option index shown on row 0, mirroring the scroll math in {@link render}. */
  private scrollTop(filtered: SelectOption[]): number {
    const visible = this.visibleRows(filtered);
    return this.combobox.highlightedIndex >= visible
      ? this.combobox.highlightedIndex - visible + 1
      : 0;
  }

  public override handleMouse(ev: any): void {
    if (ev.type !== "press" || ev.button !== "left") return;

    const h = this.overlayHeight();
    const inX = ev.x >= this.overlayX && ev.x < this.overlayX + this.overlayWidth;
    const inY = ev.y >= this.overlayY && ev.y < this.overlayY + h;
    if (!inX || !inY) {
      this.combobox.closeDropdown();
      ev.handled = true;
      return;
    }

    const filtered = this.combobox.getFilteredOptions();
    const rowIndex = this.scrollTop(filtered) + (ev.y - this.overlayY - 1);
    if (rowIndex >= 0 && rowIndex < filtered.length) {
      this.combobox.selectOption(filtered[rowIndex]);
    }
    ev.handled = true;
  }

  public override render(buffer: ScreenBuffer): void {
    const filtered = this.combobox.getFilteredOptions();
    const bg =
      App.instance?.cssResolver.resolveVariable(this.combobox, "$surface") || FALLBACK_DARK_BG;
    const fg = App.instance?.cssResolver.resolveVariable(this.combobox, "$foreground") || "#ffffff";
    const primary =
      App.instance?.cssResolver.resolveVariable(this.combobox, "$primary") || "#4daafc";
    const dim = App.instance?.cssResolver.resolveVariable(this.combobox, "$disabled") || "#666666";

    const x0 = this.overlayX;
    const y0 = this.overlayY;
    const w = this.overlayWidth;
    const h = this.overlayHeight();
    const border = new Style({ color: fg, background: bg });

    for (let x = x0; x < x0 + w; x++) {
      buffer.setCell(x, y0, "─", border);
      buffer.setCell(x, y0 + h - 1, "─", border);
    }
    for (let y = y0; y < y0 + h; y++) {
      buffer.setCell(x0, y, "│", border);
      buffer.setCell(x0 + w - 1, y, "│", border);
    }
    buffer.setCell(x0, y0, "╭", border);
    buffer.setCell(x0 + w - 1, y0, "╮", border);
    buffer.setCell(x0, y0 + h - 1, "╰", border);
    buffer.setCell(x0 + w - 1, y0 + h - 1, "╯", border);

    if (filtered.length === 0) {
      buffer.drawSegment(
        x0 + 1,
        y0 + 1,
        new Segment("No matches", new Style({ color: dim, background: bg })),
      );
      return;
    }

    const visible = this.visibleRows(filtered);
    const top = this.scrollTop(filtered);
    const innerWidth = w - 2;
    for (let i = 0; i < visible; i++) {
      const idx = top + i;
      const opt = filtered[idx];
      if (!opt) break;
      const isHighlighted = idx === this.combobox.highlightedIndex;
      const rowStyle = isHighlighted
        ? new Style({ color: bg, background: primary, bold: true })
        : new Style({ color: fg, background: bg });
      const y = y0 + 1 + i;

      const chars = splitGraphemes(opt.label);
      let visibleWidth = 0;
      let text = "";
      for (const c of chars) {
        const cw = charWidth(c);
        if (visibleWidth + cw > innerWidth) break;
        text += c;
        visibleWidth += cw;
      }
      while (visibleWidth < innerWidth) {
        text += " ";
        visibleWidth++;
      }
      buffer.drawSegment(x0 + 1, y, new Segment(text, rowStyle));
    }
  }
}

/**
 * A filterable text field with suggestions: typing narrows {@link options} to
 * those whose label contains the typed text (case-insensitive), shown in a
 * popover like the `Select` widget's dropdown.
 * Unlike `Select`, the typed text itself is the value — picking a suggestion
 * just fills it in, and (with {@link allowCustomValue}, the default) text
 * that matches no option is still accepted as a free-form value on commit.
 */
export class ComboboxWidget extends Widget {
  protected override defaultCursor() {
    return "text" as const;
  }

  /** Choices — strings or `{ value, label }`. */
  public options: (string | SelectOption)[] = [];
  /** Current text (typed or picked from a suggestion). */
  public value = "";
  /** Fired with the new text on every edit and on picking a suggestion. */
  public declare onChange?: (val: string) => void;
  /** Fired specifically when a suggestion is picked (click or Enter). */
  public declare onSelect?: (option: SelectOption) => void;
  /** Text shown when the field is empty. */
  public placeholder = "Type to search...";
  /** Whether text matching no option is kept as-is when the dropdown closes. */
  public allowCustomValue = true;

  /** Whether the suggestion popover is open. */
  public isOpen = false;
  /** Index into {@link getFilteredOptions} of the highlighted suggestion. */
  public highlightedIndex = 0;

  /** Validation; the validated value is the typed text. */
  public readonly validation: FieldValidation = attachFieldValidation(this, () => this.value);

  private cursorCol = 0;
  private overlay: ComboboxOverlayWidget | null = null;
  private overlayScreen: Screen | null = null;
  /** {@link value} when the dropdown was last opened, for reverting on close. */
  private valueAtOpen = "";

  constructor() {
    super("combobox");
    this.focusable = true;
    this.defaultStyle = { height: 3, border: "rounded" };

    this.onKey = (ev) => this.handleComboboxKey(ev);
  }

  /** Normalize {@link options} to {@link SelectOption} objects. */
  public getResolvedOptions(): SelectOption[] {
    return this.options.map((opt) => (typeof opt === "string" ? { label: opt, value: opt } : opt));
  }

  /** Options whose label contains {@link value}, case-insensitively (all options when empty). */
  public getFilteredOptions(): SelectOption[] {
    const needle = this.value.trim().toLowerCase();
    const resolved = this.getResolvedOptions();
    if (!needle) return resolved;
    return resolved.filter((o) => o.label.toLowerCase().includes(needle));
  }

  /**
   * Keep {@link highlightedIndex} pointing at a real row after the filtered
   * list shrinks (e.g. backspacing narrows the match count) — otherwise Enter
   * would index past the array and silently do nothing instead of selecting
   * the row still visibly highlighted in the overlay.
   */
  private clampHighlightedIndex(): void {
    const count = this.getFilteredOptions().length;
    if (this.highlightedIndex > count - 1) {
      this.highlightedIndex = Math.max(0, count - 1);
    }
  }

  /** Commit `option` as the value, close the popover, and fire onChange/onSelect. */
  public selectOption(option: SelectOption): void {
    this.value = option.label;
    this.cursorCol = splitGraphemes(this.value).length;
    this.onChange?.(this.value);
    this.onSelect?.(option);
    this.validation.maybeValidate("change");
    this.closeDropdown();
  }

  /** Open the suggestion popover. */
  public openDropdown(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.highlightedIndex = 0;
    this.valueAtOpen = this.value;

    const screen = this.getScreen();
    if (!screen) return;

    const clientRect = this.getClientRect();
    const overlayWidth = clientRect.width;
    const naturalHeight =
      Math.min(Math.max(this.getFilteredOptions().length, 1), MAX_VISIBLE_ROWS) + 2;

    const screenHeight = screen.region.height;
    const spaceBelow = screenHeight - clientRect.bottom;
    const spaceAbove = clientRect.y;

    // Prefer the side with more room; if neither side fits the natural
    // height, shrink to whichever side has more space rather than opening at
    // the natural height and overflowing past the screen edge.
    const below = spaceBelow >= naturalHeight || spaceBelow >= spaceAbove;
    const available = below ? spaceBelow : spaceAbove;
    const overlayHeight = Math.max(1, Math.min(naturalHeight, available));
    const overlayY = below ? clientRect.bottom : Math.max(0, clientRect.y - overlayHeight);

    this.overlay = new ComboboxOverlayWidget(
      this,
      clientRect.x,
      overlayY,
      overlayWidth,
      overlayHeight,
    );
    screen.addOverlay(this.overlay);
    this.overlayScreen = screen;
    App.instance?.queueRender();
  }

  /** Close the popover, keeping (or reverting) the typed value per {@link allowCustomValue}. */
  public closeDropdown(): void {
    if (!this.isOpen) return;
    this.isOpen = false;

    if (!this.allowCustomValue) {
      const filtered = this.getFilteredOptions();
      const exact = filtered.find((o) => o.label.toLowerCase() === this.value.trim().toLowerCase());
      if (exact) {
        this.value = exact.label;
      } else {
        // No exact match for the typed text: revert to the value shown when
        // the dropdown opened if it was itself a valid option, rather than
        // silently committing an arbitrary first-filtered-match the user
        // never picked. Falls back to clearing if there's nothing valid to
        // revert to.
        const resolved = this.getResolvedOptions();
        const openValueValid = resolved.some(
          (o) => o.label.toLowerCase() === this.valueAtOpen.trim().toLowerCase(),
        );
        this.value = openValueValid ? this.valueAtOpen : "";
      }
      this.cursorCol = splitGraphemes(this.value).length;
    }

    const screen = this.overlayScreen ?? this.getScreen();
    if (screen && this.overlay) screen.removeOverlay(this.overlay);
    this.overlay = null;
    this.overlayScreen = null;
    App.instance?.queueRender();
  }

  /** The owning {@link Screen}, or null when detached. */
  public getScreen(): Screen | null {
    let current: any = this.parent;
    while (current) {
      if (current instanceof Screen) return current;
      current = current.parent;
    }
    return null;
  }

  public override handleMouse(ev: any): void {
    super.handleMouse(ev);
    if (ev.handled) return;
    if (ev.type === "press" && ev.button === "left") this.openDropdown();
  }

  private handleComboboxKey(ev: any): void {
    const keyName = ev.name || ev.key;
    const chars = splitGraphemes(this.value);
    if (this.cursorCol > chars.length) this.cursorCol = chars.length;

    const originalValue = this.value;

    if (keyName === "left") {
      this.cursorCol = Math.max(0, this.cursorCol - 1);
    } else if (keyName === "right") {
      this.cursorCol = Math.min(chars.length, this.cursorCol + 1);
    } else if (keyName === "home") {
      this.cursorCol = 0;
    } else if (keyName === "end") {
      this.cursorCol = chars.length;
    } else if (keyName === "backspace") {
      if (this.cursorCol > 0) {
        chars.splice(this.cursorCol - 1, 1);
        this.value = chars.join("");
        this.cursorCol--;
        this.clampHighlightedIndex();
      }
    } else if (keyName === "delete") {
      if (this.cursorCol < chars.length) {
        chars.splice(this.cursorCol, 1);
        this.value = chars.join("");
        this.clampHighlightedIndex();
      }
    } else if (keyName === "down") {
      if (!this.isOpen) {
        this.openDropdown();
      } else {
        const count = this.getFilteredOptions().length;
        this.highlightedIndex = count > 0 ? Math.min(count - 1, this.highlightedIndex + 1) : 0;
      }
    } else if (keyName === "up") {
      if (this.isOpen) this.highlightedIndex = Math.max(0, this.highlightedIndex - 1);
    } else if (keyName === "enter") {
      const filtered = this.getFilteredOptions();
      if (this.isOpen && filtered[this.highlightedIndex]) {
        this.selectOption(filtered[this.highlightedIndex]);
      } else {
        this.closeDropdown();
      }
    } else if (keyName === "escape") {
      this.closeDropdown();
    } else if (keyName === "tab") {
      this.closeDropdown();
    } else if (ev.key && splitGraphemes(ev.key).length === 1 && !ev.ctrl && !ev.meta) {
      chars.splice(this.cursorCol, 0, ev.key);
      this.value = chars.join("");
      this.cursorCol++;
      this.highlightedIndex = 0;
      if (!this.isOpen) this.openDropdown();
    }

    ev.handled = true;

    if (this.value !== originalValue) {
      this.onChange?.(this.value);
      this.validation.maybeValidate("change");
    }
  }

  public override onUnmount(): void {
    this.closeDropdown();
    super.onUnmount();
  }

  protected override resolveBorderColor(): string | undefined {
    const severityColor = this.validation.resolveColor();
    if (severityColor) return severityColor;
    if (this.focused && this.style.borderColor === undefined && App.instance) {
      return App.instance.cssResolver.resolveVariable(this, "$focus");
    }
    return super.resolveBorderColor();
  }

  public override render(buffer: ScreenBuffer): void {
    super.render(buffer);
    const contentRect = this.getContentRect();

    const fg = this.computedStyle.color || "default";
    const bg = this.findResolvedBackground();
    const disabled = this.isDisabled();
    const focusColor = App.instance?.cssResolver.resolveVariable(this, "$focus") || fg;

    let displayColor = fg;
    if (disabled) {
      displayColor = App.instance?.cssResolver.resolveVariable(this, "$disabled") || fg;
    } else if (this.focused) {
      displayColor = focusColor;
    }
    const textStyle = new Style({ color: displayColor, background: bg });

    const textWidth = Math.max(1, contentRect.width - 1); // -1 for the chevron
    const chars = splitGraphemes(this.value);
    let scrollX = 0;
    if (this.cursorCol >= scrollX + textWidth) scrollX = this.cursorCol - textWidth + 1;
    if (this.cursorCol < scrollX) scrollX = this.cursorCol;

    const isEmpty = this.value === "";
    const style = isEmpty
      ? new Style({
          color: App.instance?.cssResolver.resolveVariable(this, "$placeholder") || "gray",
          background: bg,
        })
      : textStyle;
    const displayText = isEmpty ? this.placeholder : chars.slice(scrollX).join("");

    buffer.drawSegment(contentRect.x, contentRect.y, new Segment(displayText, style), contentRect);

    if (this.focused && !disabled) {
      const caretX = contentRect.x + stringWidth(chars.slice(scrollX, this.cursorCol).join(""));
      if (caretX < contentRect.right - 1) {
        const under = chars[this.cursorCol] ?? " ";
        buffer.setCell(
          caretX,
          contentRect.y,
          under,
          new Style({ color: bg, background: focusColor }),
        );
      }
    }

    const chevronX = contentRect.right - 1;
    buffer.setCell(chevronX, contentRect.y, this.isOpen ? "▲" : "▼", textStyle);
  }
}
