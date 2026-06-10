import { App } from "../../core/app.ts";
import { Screen } from "../../dom/screen.ts";
import { Widget } from "../../dom/widget.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { charWidth, Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { attachFieldValidation, type FieldValidation } from "./validation.ts";

export interface SelectOption {
  label: string;
  value: string;
}

export class DropdownOverlayWidget extends Widget {
  constructor(
    public selectWidget: SelectWidget,
    public dropdownX: number,
    public dropdownY: number,
    public dropdownWidth: number,
    public dropdownHeight: number,
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

  public override handleMouse(ev: any): void {
    if (ev.type === "press" && ev.button === "left") {
      const clickX = ev.x;
      const clickY = ev.y;

      const inX = clickX >= this.dropdownX && clickX < this.dropdownX + this.dropdownWidth;
      const inY = clickY >= this.dropdownY && clickY < this.dropdownY + this.dropdownHeight;

      if (inX && inY) {
        // Clicks inside dropdown:
        // Option index is offset from top border (which takes 1 line)
        const optionIndex = clickY - this.dropdownY - 1;
        const options = this.selectWidget.getResolvedOptions();
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
      App.instance?.cssResolver.resolveVariable(this.selectWidget, "$surface") || "#1e1e2e";
    const fg =
      App.instance?.cssResolver.resolveVariable(this.selectWidget, "$foreground") || "#ffffff";
    const primary =
      App.instance?.cssResolver.resolveVariable(this.selectWidget, "$primary") || "#00ffff";

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

    // Draw options
    const options = this.selectWidget.getResolvedOptions();
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      const optionY = this.dropdownY + 1 + i;
      const isHovered = i === this.selectWidget.hoveredIndex;
      const isSelected = this.selectWidget.isOptionSelected(option.value);

      // Determine text to show: E.g., for multi-select, show "[x] Label" or "[ ] Label"
      let prefix = "";
      if (this.selectWidget.multiple) {
        prefix = isSelected ? "☑ " : "☐ ";
      } else {
        prefix = isSelected ? "● " : "  ";
      }

      const displayText = prefix + option.label;
      const displayChars = [...displayText];
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
  public options: (string | SelectOption)[] = [];
  public value: string | string[] = "";
  public multiple = false;
  public declare onChange?: (val: any) => void;
  public placeholder = "Select...";

  public isOpen = false;
  public hoveredIndex = 0;

  /** Validation; the validated value is the current selection. */
  public readonly validation: FieldValidation = attachFieldValidation(this, () => this.value);

  private overlay: DropdownOverlayWidget | null = null;

  constructor() {
    super("select");
    this.focusable = true;
    this.defaultStyle = { height: 3 };

    this.onKey = (ev) => {
      this.handleSelectKey(ev);
    };
  }

  public getResolvedOptions(): SelectOption[] {
    return this.options.map((opt) => {
      if (typeof opt === "string") {
        return { label: opt, value: opt };
      }
      return opt;
    });
  }

  public isOptionSelected(val: string): boolean {
    if (this.multiple) {
      return Array.isArray(this.value) && this.value.includes(val);
    }
    return this.value === val;
  }

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

  public openDropdown() {
    if (this.isOpen) return;
    this.isOpen = true;

    const screen = this.getScreen();
    if (!screen) return;

    const clientRect = this.getClientRect();
    const resolved = this.getResolvedOptions();
    const dropdownHeight = resolved.length + 2; // +2 for borders
    const dropdownWidth = clientRect.width;

    // Position detection
    const screenHeight = screen.region.height;
    const spaceBelow = screenHeight - clientRect.bottom;
    const spaceAbove = clientRect.y;

    let dropdownY = clientRect.bottom;
    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      dropdownY = Math.max(0, clientRect.y - dropdownHeight);
    }

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
      dropdownHeight,
    );
    screen.addOverlay(this.overlay);
    App.instance?.queueRender();
  }

  public closeDropdown() {
    if (!this.isOpen) return;
    this.isOpen = false;

    const screen = this.getScreen();
    if (screen && this.overlay) {
      screen.removeOverlay(this.overlay);
    }
    this.overlay = null;
    App.instance?.queueRender();
  }

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

  public override render(buffer: ScreenBuffer): void {
    if (this.computedStyle.border === undefined) {
      this.computedStyle.border = "rounded";
    }
    const severityColor = this.validation.resolveColor();
    if (severityColor) {
      this.computedStyle.borderColor = severityColor;
    }

    super.render(buffer);
    const contentRect = this.getContentRect();

    const fg = this.computedStyle.color || "default";
    const bg = this.findResolvedBackground();

    // Choose styling based on state
    let displayColor = fg;
    if (this.focused) {
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
      const displayChars = [...displayLabel];
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
