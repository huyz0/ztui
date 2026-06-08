import { App } from "../core/app.ts";
import { Widget } from "../dom/widget.ts";
import type { ScreenBuffer } from "../render/buffer.ts";
import { stringWidth } from "../render/segment.ts";
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

    if (this.cursorCol > this.value.length) {
      this.cursorCol = this.value.length;
    }

    const keyName = ev.name || ev.key;

    if (keyName === "left") {
      this.cursorCol = Math.max(0, this.cursorCol - 1);
    } else if (keyName === "right") {
      this.cursorCol = Math.min(this.value.length, this.cursorCol + 1);
    } else if (keyName === "home") {
      this.cursorCol = 0;
    } else if (keyName === "end") {
      this.cursorCol = this.value.length;
    } else if (keyName === "backspace") {
      if (this.cursorCol > 0) {
        this._value = this._value.slice(0, this.cursorCol - 1) + this._value.slice(this.cursorCol);
        this.cursorCol--;
      }
    } else if (keyName === "delete") {
      if (this.cursorCol < this._value.length) {
        this._value = this._value.slice(0, this.cursorCol) + this._value.slice(this.cursorCol + 1);
      }
    } else if (keyName === "enter" || keyName === "tab") {
      // ignore control keys
    } else if (ev.key && ev.key.length === 1) {
      this._value =
        this._value.slice(0, this.cursorCol) + ev.key + this._value.slice(this.cursorCol);
      this.cursorCol++;
    }

    // Keep cursor in horizontal view
    if (this.cursorCol < this.scrollX) {
      this.scrollX = this.cursorCol;
    } else if (this.cursorCol >= this.scrollX + contentRect.width) {
      this.scrollX = this.cursorCol - contentRect.width + 1;
    }
    this.scrollX = Math.max(0, Math.min(this.value.length - contentRect.width, this.scrollX));

    if (this.value !== originalValue && this.onChange) {
      this.onChange(this.value);
    }
  }

  public override handleMouse(ev: any): void {
    super.handleMouse(ev);
    if (ev.handled) return;

    if (ev.type === "press" && ev.button === "left") {
      const contentRect = this.getContentRect();
      const clickCol = ev.x - contentRect.x;
      const absoluteCol = this.scrollX + clickCol;

      this.cursorCol = Math.max(0, Math.min(this.value.length, absoluteCol));

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
    super.render(buffer);

    const contentRect = this.getContentRect();

    if (this.cursorCol > this.value.length) {
      this.cursorCol = this.value.length;
    }

    const fg = this.computedStyle.color || "default";
    const bg = this.findResolvedBackground();
    const style = new Style({ color: fg, background: bg });

    const cells: { char: string; style: Style }[] = [];

    if (this.value === "" && this.placeholder) {
      const phColor = App.instance?.cssResolver.resolveVariable(this, "$placeholder") || "gray";
      const placeholderStyle = new Style({ color: phColor, background: bg });
      for (let i = 0; i < this.placeholder.length; i++) {
        cells.push({ char: this.placeholder[i], style: placeholderStyle });
      }
    } else {
      for (let i = 0; i < this.value.length; i++) {
        cells.push({ char: this.value[i], style });
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

    const visibleCells = cells.slice(this.scrollX, this.scrollX + contentRect.width);
    let drawX = contentRect.x;
    for (const cell of visibleCells) {
      if (drawX >= contentRect.right) break;
      buffer.setCell(drawX, contentRect.y, cell.char, cell.style);
      drawX += stringWidth(cell.char);
    }
  }
}
