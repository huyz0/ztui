import { App } from "../../core/app.ts";
import { Screen } from "../../dom/screen.ts";
import type { AccessibleNode } from "../../dom/widget.ts";
import { Widget } from "../../dom/widget.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { charWidth, Segment, splitGraphemes, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { FALLBACK_DARK_BG } from "../../theme.ts";
import { attachFieldValidation, type FieldValidation } from "./validation.ts";

/** A {@link Select} choice with a display label distinct from its value. */
export interface SelectOption {
  /** Text shown to the user. */
  label: string;
  /** The value reported on selection. */
  value: string;
}

// Caps the dropdown's natural height the same way Combobox does, so a long
// option list scrolls instead of the overlay growing past the viewport with
// no way to reach rows beyond the bottom (or top) screen edge.
const MAX_VISIBLE_ROWS = 8;

export class DropdownOverlayWidget extends Widget {
  protected override defaultCursor() {
    return "pointer" as const;
  }

  constructor(
    public selectWidget: SelectWidget,
    public dropdownX: number,
    public dropdownY: number,
    public dropdownWidth: number,
    /**
     * Caps the painted height below the natural row count when the screen
     * doesn't have room in either direction — otherwise the overlay would
     * still overflow past the screen edge even after {@link SelectWidget.openDropdown}
     * picked the side with more (but still insufficient) space.
     */
    private maxHeight = Number.POSITIVE_INFINITY,
  ) {
    super("dropdown-overlay");
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

  public get dropdownHeight(): number {
    const natural =
      Math.min(Math.max(this.selectWidget.getResolvedOptions().length, 1), MAX_VISIBLE_ROWS) + 2;
    return Math.max(3, Math.min(natural, this.maxHeight));
  }

  /** Rows actually drawn, given the (possibly space-clamped) overlay height. */
  private visibleRows(options: SelectOption[]): number {
    return Math.min(options.length, MAX_VISIBLE_ROWS, this.dropdownHeight - 2);
  }

  /** First option index shown on row 0, mirroring the scroll math in {@link render}. */
  private scrollTop(options: SelectOption[]): number {
    const visible = this.visibleRows(options);
    return this.selectWidget.hoveredIndex >= visible
      ? this.selectWidget.hoveredIndex - visible + 1
      : 0;
  }

  public override handleMouse(ev: any): void {
    if (ev.type === "press" && ev.button === "left") {
      const clickX = ev.x;
      const clickY = ev.y;

      const h = this.dropdownHeight;
      const inX = clickX >= this.dropdownX && clickX < this.dropdownX + this.dropdownWidth;
      const inY = clickY >= this.dropdownY && clickY < this.dropdownY + h;

      if (inX && inY) {
        // Clicks inside dropdown:
        // Option index is offset from top border (which takes 1 line), then
        // scrolled by however many rows are scrolled past.
        const options = this.selectWidget.getResolvedOptions();
        const optionIndex = this.scrollTop(options) + (clickY - this.dropdownY - 1);
        if (optionIndex >= 0 && optionIndex < options.length) {
          this.selectWidget.selectOptionIndex(optionIndex);
        }
      } else {
        // Clicks outside dropdown: close dropdown
        this.selectWidget.closeDropdown();
      }
      ev.handled = true;
    }
  }

  public override render(buffer: ScreenBuffer): void {
    // Backdrop is transparent, we don't draw anything on the full screen except the dropdown box
    const bg =
      App.instance?.cssResolver.resolveVariable(this.selectWidget, "$surface") || FALLBACK_DARK_BG;
    const fg =
      App.instance?.cssResolver.resolveVariable(this.selectWidget, "$foreground") || "#ffffff";
    const primary =
      App.instance?.cssResolver.resolveVariable(this.selectWidget, "$primary") || "#4daafc";

    const borderStyle = new Style({ color: fg, background: bg });

    // Draw dropdown border
    // Top, bottom horizontal edges
    for (let x = this.dropdownX; x < this.dropdownX + this.dropdownWidth; x++) {
      buffer.setCell(x, this.dropdownY, "─", borderStyle);
      buffer.setCell(x, this.dropdownY + this.dropdownHeight - 1, "─", borderStyle);
    }
    // Left, right vertical edges
    for (let y = this.dropdownY; y < this.dropdownY + this.dropdownHeight; y++) {
      buffer.setCell(this.dropdownX, y, "│", borderStyle);
      buffer.setCell(this.dropdownX + this.dropdownWidth - 1, y, "│", borderStyle);
    }
    // Corners (rounded, matching the default border style)
    buffer.setCell(this.dropdownX, this.dropdownY, "╭", borderStyle);
    buffer.setCell(this.dropdownX + this.dropdownWidth - 1, this.dropdownY, "╮", borderStyle);
    buffer.setCell(this.dropdownX, this.dropdownY + this.dropdownHeight - 1, "╰", borderStyle);
    buffer.setCell(
      this.dropdownX + this.dropdownWidth - 1,
      this.dropdownY + this.dropdownHeight - 1,
      "╯",
      borderStyle,
    );

    // Draw options — only the visible, scrolled-into-view slice.
    const options = this.selectWidget.getResolvedOptions();
    const visible = this.visibleRows(options);
    const top = this.scrollTop(options);
    for (let row = 0; row < visible; row++) {
      const i = top + row;
      const option = options[i];
      if (!option) break;
      const optionY = this.dropdownY + 1 + row;
      const isHovered = i === this.selectWidget.hoveredIndex;
      const isSelected = this.selectWidget.isOptionSelected(option.value);

      // Determine text to show: E.g., for multi-select, show "[x] Label" or "[ ] Label"
      let prefix = "";
      if (this.selectWidget.multiple) {
        // "☒" (not the emoji-codepoint "☑") so it matches "☐"'s plain text
        // weight — see checkbox.ts's marker comment for why.
        prefix = isSelected ? "☒ " : "☐ ";
      } else {
        prefix = isSelected ? "● " : "  ";
      }

      const displayText = prefix + option.label;
      const displayChars = splitGraphemes(displayText);
      const targetWidth = this.dropdownWidth - 2;
      let currentWidth = 0;
      const visibleChars: string[] = [];
      for (const char of displayChars) {
        const w = charWidth(char);
        if (currentWidth + w > targetWidth) {
          break;
        }
        visibleChars.push(char);
        currentWidth += w;
      }
      while (currentWidth < targetWidth) {
        visibleChars.push(" ");
        currentWidth += 1;
      }

      let style: Style;
      if (isHovered) {
        style = new Style({ color: bg, background: primary, bold: true });
      } else if (isSelected) {
        style = new Style({ color: primary, background: bg, bold: true });
      } else {
        style = new Style({ color: fg, background: bg });
      }

      // Draw the characters of the option inside the border bounds safely
      let drawX = this.dropdownX + 1;
      for (const char of visibleChars) {
        buffer.setCell(drawX, optionY, char, style);
        drawX += charWidth(char);
      }
    }
  }
}

export class SelectWidget extends Widget {
  protected override defaultCursor() {
    return "pointer" as const;
  }

  /** Choices — strings or `{ value, label }`. */
  public options: (string | SelectOption)[] = [];
  /** Current selection (a value, or array when `multiple`). */
  public value: string | string[] = "";
  /** Allow selecting multiple options. */
  public multiple = false;
  /** Fired with the new selection (a value, or array when `multiple`). */
  public declare onChange?: (val: string | string[]) => void;
  /** Text shown when nothing is selected. */
  public placeholder = "Select...";

  /** Whether the dropdown is open. */
  public isOpen = false;
  private _hoveredIndex = 0;
  /**
   * Index of the highlighted option while open. Clamped to the current
   * (resolved) options length on every read — `options` can be reassigned to
   * a shorter array externally (e.g. an async reload) while the dropdown
   * stays open, with no keypress to trigger the keyboard handler's own
   * clamp. Without this, render()/handleMouse() would use a stale
   * out-of-range index: render() breaks out of its draw loop early (blank
   * rows) and handleMouse() computes an index past the option list, so
   * clicks silently no-op.
   */
  public get hoveredIndex(): number {
    const max = this.getResolvedOptions().length - 1;
    if (max < 0) return 0;
    return Math.min(this._hoveredIndex, max);
  }
  public set hoveredIndex(index: number) {
    this._hoveredIndex = index;
  }

  /** Validation; the validated value is the current selection. */
  public readonly validation: FieldValidation = attachFieldValidation(this, () => this.value);

  private overlay: DropdownOverlayWidget | null = null;
  // Remembered when the dropdown opens: at unmount time the widget is already
  // detached from its parent, so getScreen() would return null and the overlay
  // would leak. Holding the screen lets closeDropdown() always reach it.
  private overlayScreen: Screen | null = null;

  constructor() {
    super("select");
    this.focusable = true;
    this.defaultStyle = { height: 3, border: "rounded" };

    this.onKey = (ev) => {
      this.handleSelectKey(ev);
    };
  }

  /** Normalize {@link options} to {@link SelectOption} objects. */
  public getResolvedOptions(): SelectOption[] {
    return this.options.map((opt) => {
      if (typeof opt === "string") {
        return { label: opt, value: opt };
      }
      return opt;
    });
  }

  /** Whether `val` is currently selected. */
  public isOptionSelected(val: string): boolean {
    if (this.multiple) {
      return Array.isArray(this.value) && this.value.includes(val);
    }
    return this.value === val;
  }

  /** Toggle `val` in the selection (single- or multi-select). */
  public toggleOption(val: string) {
    if (this.multiple) {
      const current = Array.isArray(this.value) ? [...this.value] : [];
      const idx = current.indexOf(val);
      if (idx >= 0) {
        current.splice(idx, 1);
      } else {
        current.push(val);
      }
      this.value = current;
      this.onChange?.(current);
    } else {
      this.value = val;
      this.onChange?.(val);
    }
    this.validation.maybeValidate("change");
  }

  /** Select (or toggle, when multiple) the option at `index` in the resolved list. */
  public selectOptionIndex(index: number) {
    const resolved = this.getResolvedOptions();
    if (index >= 0 && index < resolved.length) {
      const option = resolved[index];
      this.toggleOption(option.value);
      if (!this.multiple) {
        this.closeDropdown();
      }
    }
  }

  /** Open the dropdown overlay. */
  public openDropdown() {
    if (this.isOpen) return;
    this.isOpen = true;

    const screen = this.getScreen();
    if (!screen) return;

    const clientRect = this.getClientRect();
    const resolved = this.getResolvedOptions();
    const naturalHeight = Math.min(Math.max(resolved.length, 1), MAX_VISIBLE_ROWS) + 2;
    const dropdownWidth = clientRect.width;

    // Position detection: prefer the side with more room; if neither side
    // fits the natural height, shrink to whichever side has more space
    // rather than opening at the natural height and overflowing past the
    // screen edge with no way to scroll into the overflow.
    const screenHeight = screen.region.height;
    const spaceBelow = screenHeight - clientRect.bottom;
    const spaceAbove = clientRect.y;

    const below = spaceBelow >= naturalHeight || spaceBelow >= spaceAbove;
    const available = below ? spaceBelow : spaceAbove;
    const maxHeight = Math.max(1, Math.min(naturalHeight, available));
    const dropdownY = below ? clientRect.bottom : Math.max(0, clientRect.y - maxHeight);

    this.hoveredIndex = 0;
    // Highlight the first selected option if single-select
    if (!this.multiple && this.value) {
      const idx = resolved.findIndex((o) => o.value === this.value);
      if (idx >= 0) this.hoveredIndex = idx;
    }

    this.overlay = new DropdownOverlayWidget(
      this,
      clientRect.x,
      dropdownY,
      dropdownWidth,
      maxHeight,
    );
    screen.addOverlay(this.overlay);
    this.overlayScreen = screen;
    App.instance?.queueRender();
  }

  /** Close the dropdown overlay. */
  public closeDropdown() {
    if (!this.isOpen) return;
    this.isOpen = false;

    // Prefer the screen the overlay was added to (the parent chain may already
    // be detached if we're closing during unmount); fall back to a live lookup.
    const screen = this.overlayScreen ?? this.getScreen();
    if (screen && this.overlay) {
      screen.removeOverlay(this.overlay);
    }
    this.overlay = null;
    this.overlayScreen = null;
    App.instance?.queueRender();
  }

  /**  */
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

    if (ev.type === "press" && ev.button === "left") {
      this.openDropdown();
    }
  }

  private handleSelectKey(ev: any) {
    const keyName = ev.name || ev.key;
    const resolved = this.getResolvedOptions();

    if (!this.isOpen) {
      if (keyName === "enter" || keyName === "space" || keyName === " " || keyName === "down") {
        this.openDropdown();
        ev.handled = true;
      }
    } else {
      // `options` can be reassigned to a shorter array while the dropdown is
      // still open (e.g. a dependent-dropdown pattern), leaving hoveredIndex
      // pointing past the end — clamp before acting on it, otherwise Enter
      // silently no-ops (selectOptionIndex bounds-checks) with no visible
      // explanation, and the overlay shows no highlight at all.
      if (this.hoveredIndex > resolved.length - 1) {
        this.hoveredIndex = Math.max(0, resolved.length - 1);
      }
      if (keyName === "up") {
        this.hoveredIndex = Math.max(0, this.hoveredIndex - 1);
        ev.handled = true;
      } else if (keyName === "down") {
        this.hoveredIndex = Math.min(resolved.length - 1, this.hoveredIndex + 1);
        ev.handled = true;
      } else if (keyName === "space" || keyName === " " || keyName === "enter") {
        this.selectOptionIndex(this.hoveredIndex);
        ev.handled = true;
      } else if (keyName === "escape" || keyName === "tab") {
        this.closeDropdown();
        // Don't fully handle tab, let focus move
        if (keyName === "escape") ev.handled = true;
      }
    }
  }

  public override onUnmount(): void {
    this.closeDropdown();
    super.onUnmount();
  }

  public override getAccessibleNode(): AccessibleNode | null {
    if (!this.visible) return null;
    const resolved = this.getResolvedOptions();
    const state: string[] = [];
    if (this.focused) state.push("focused");
    if (this.isDisabled()) state.push("disabled");
    state.push(this.isOpen ? "expanded" : "collapsed");
    state.push(`${resolved.length} option${resolved.length === 1 ? "" : "s"}`);

    let label: string;
    let value: string | undefined;
    if (this.multiple) {
      const selected = Array.isArray(this.value) ? this.value : [];
      const labels = selected.map((v) => resolved.find((o) => o.value === v)?.label ?? v);
      label = labels.length > 0 ? labels.join(", ") : this.placeholder;
      value = selected.join(",");
      state.push(`${selected.length} selected`);
    } else {
      const opt = resolved.find((o) => o.value === this.value);
      label = opt ? opt.label : this.value ? String(this.value) : this.placeholder;
      value = (this.value as string) || undefined;
    }

    return { role: "select", label, value, state };
  }

  // Validation severity wins; else a focused select breathes its border with the
  // $focus accent, so focus shows on the box itself, not only the value text.
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

    // Choose styling based on state
    let displayColor = fg;
    if (disabled) {
      displayColor = App.instance?.cssResolver.resolveVariable(this, "$disabled") || fg;
    } else if (this.focused) {
      displayColor = App.instance?.cssResolver.resolveVariable(this, "$focus") || fg;
    }
    const textStyle = new Style({ color: displayColor, background: bg });

    // Determine current label to show
    let displayLabel = "";
    const resolved = this.getResolvedOptions();

    if (this.multiple) {
      const selected = Array.isArray(this.value) ? this.value : [];
      if (selected.length === 0) {
        displayLabel = this.placeholder;
      } else {
        const labels = selected.map((v) => {
          const opt = resolved.find((o) => o.value === v);
          return opt ? opt.label : v;
        });
        displayLabel = `[${labels.join(",")}]`;
      }
    } else {
      const opt = resolved.find((o) => o.value === this.value);
      displayLabel = opt ? opt.label : this.value ? String(this.value) : this.placeholder;
    }

    // Shrink text if too long to fit with chevron (safely handling wide chars/emojis)
    const maxTextWidth = contentRect.width - 3; // 2 for chevron + 1 spacing
    if (stringWidth(displayLabel) > maxTextWidth) {
      const displayChars = splitGraphemes(displayLabel);
      let currentWidth = 0;
      let truncated = "";
      for (const char of displayChars) {
        const w = charWidth(char);
        if (currentWidth + w + 1 > maxTextWidth) {
          truncated += "…";
          break;
        }
        truncated += char;
        currentWidth += w;
      }
      displayLabel = truncated;
    }

    // Draw select value label
    const style =
      this.value === "" && !this.multiple
        ? new Style({
            color: App.instance?.cssResolver.resolveVariable(this, "$placeholder") || "gray",
            background: bg,
          })
        : textStyle;

    buffer.drawSegment(contentRect.x, contentRect.y, new Segment(displayLabel, style), contentRect);

    // Draw chevron icon or simple indicator on the right edge
    const chevronX = contentRect.right - 1;
    const chevron = this.isOpen ? "▲" : "▼";
    buffer.setCell(chevronX, contentRect.y, chevron, textStyle);
  }
}
