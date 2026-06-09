import { App } from "../core/app.ts";
import { Widget } from "../dom/widget.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { iconRegistry } from "../render/icon-registry.ts";
import { Segment, stringWidth } from "../render/segment.ts";
import { Style } from "../render/style.ts";

export class InputWidget extends Widget {
  private _value = "";
  public get value(): string {
    return this._value;
  }
  public set value(val: string) {
    const oldVal = this._value;
    this._value = val;
    if (this.cursorCol === oldVal.length) {
      this.cursorCol = val.length;
    } else {
      this.cursorCol = Math.min(this.cursorCol, val.length);
    }
  }

  public onChange?: (val: string) => void;
  public placeholder = "";

  // Input Type, Icons, & Validation
  public type: "text" | "password" | "email" = "text";
  public icon = "";
  public suffixIcon = "";
  public invalid = false;

  private cursorCol = 0;
  private scrollX = 0;

  private _focused = false;
  private blinkInterval: any = null;
  private cursorVisible = true;

  constructor() {
    super("input");
    this.focusable = true;
    this.defaultStyle = { height: 3 };

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
    if (this.blinkInterval) clearInterval(this.blinkInterval);
    this.blinkInterval = setInterval(() => {
      this.cursorVisible = !this.cursorVisible;
      App.instance?.queueRender();
    }, 530);
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

    const chars = [...this.value];
    if (this.cursorCol > chars.length) {
      this.cursorCol = chars.length;
    }

    const keyName = ev.name || ev.key;

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
        this._value = chars.join("");
        this.cursorCol--;
      }
    } else if (keyName === "delete") {
      if (this.cursorCol < chars.length) {
        chars.splice(this.cursorCol, 1);
        this._value = chars.join("");
      }
    } else if (keyName === "enter" || keyName === "tab") {
      // ignore control keys
    } else if (ev.key && ev.key.length === 1) {
      chars.splice(this.cursorCol, 0, ev.key);
      this._value = chars.join("");
      this.cursorCol++;
    }

    // Keep cursor in horizontal view
    if (this.cursorCol < this.scrollX) {
      this.scrollX = this.cursorCol;
    } else if (this.cursorCol >= this.scrollX + textWidth) {
      this.scrollX = this.cursorCol - textWidth + 1;
    }
    this.scrollX = Math.max(0, Math.min(chars.length - textWidth + 1, this.scrollX));

    if (this.value !== originalValue && this.onChange) {
      this.onChange(this.value);
    }
  }

  public override handleMouse(ev: any): void {
    super.handleMouse(ev);
    if (ev.handled) return;

    if (ev.type === "press" && ev.button === "left") {
      const contentRect = this.getContentRect();
      const prefixWidth = this.icon ? Math.max(2, stringWidth(this.icon)) + 1 : 0;

      const clickCol = ev.x - (contentRect.x + prefixWidth);
      const absoluteCol = this.scrollX + clickCol;

      const chars = [...this.value];
      this.cursorCol = Math.max(0, Math.min(chars.length, absoluteCol));

      this.cursorVisible = true;
      this.startBlinking();

      App.instance?.queueRender();
    }
  }

  public override render(buffer: ScreenBuffer): void {
    if (this.focused !== this._focused) {
      this._focused = this.focused;
      if (this.focused) {
        this.startBlinking();
      } else {
        this.stopBlinking();
      }
    }

    if (this.computedStyle.border === undefined) {
      this.computedStyle.border = "solid";
    }

    // Apply error border color if invalid
    if (this.invalid && App.instance) {
      const errorColor = App.instance.cssResolver.resolveVariable(this, "$error") || "red";
      this.computedStyle.borderColor = errorColor;
    }

    super.render(buffer);

    const contentRect = this.getContentRect();
    const prefixWidth = this.icon ? Math.max(2, stringWidth(this.icon)) + 1 : 0;
    const suffixWidth = this.suffixIcon ? Math.max(2, stringWidth(this.suffixIcon)) + 1 : 0;
    const textWidth = Math.max(1, contentRect.width - prefixWidth - suffixWidth);

    const chars = [...this.value];
    if (this.cursorCol > chars.length) {
      this.cursorCol = chars.length;
    }

    const fg = this.computedStyle.color || "default";
    const bg = this.findResolvedBackground();
    const style = new Style({ color: fg, background: bg });

    // Draw prefix icon if defined
    if (this.icon) {
      const iconColor =
        this.invalid && App.instance
          ? App.instance.cssResolver.resolveVariable(this, "$error") || "red"
          : fg;
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
        this.invalid && App.instance
          ? App.instance.cssResolver.resolveVariable(this, "$error") || "red"
          : fg;
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
      const phChars = [...this.placeholder];
      for (const char of phChars) {
        cells.push({ char, style: placeholderStyle });
      }
    } else {
      const valChars = [...this.value];
      const displayValue = this.type === "password" ? "•".repeat(valChars.length) : this.value;
      const displayChars = [...displayValue];
      for (const char of displayChars) {
        cells.push({ char, style });
      }
    }

    // Add cursor styling
    if (this.focused && this.cursorVisible) {
      const focusColor = App.instance?.cssResolver.resolveVariable(this, "$focus") || fg;
      if (this.cursorCol === cells.length) {
        cells.push({ char: "█", style: new Style({ color: focusColor, background: bg }) });
      } else if (this.cursorCol < cells.length) {
        cells[this.cursorCol].style = new Style({ color: bg, background: focusColor });
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
