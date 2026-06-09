import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Syntax } from "../../render/rich/syntax.ts";
import { RichText } from "../../render/rich/text.ts";
import { stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { attachFieldValidation, type FieldValidation } from "./validation.ts";

export class TextAreaWidget extends Widget {
  private _value = "";
  public get value(): string {
    return this._value;
  }
  public set value(val: string) {
    const oldLines = this._value.split(/\r?\n/);
    this._value = val;
    const newLines = val.split(/\r?\n/);

    const isAtEnd =
      this.cursorRow === oldLines.length - 1 &&
      this.cursorCol === [...oldLines[this.cursorRow]].length;

    if (isAtEnd || this._value === "") {
      this.cursorRow = newLines.length - 1;
      this.cursorCol = [...newLines[this.cursorRow]].length;
    } else {
      this.cursorRow = Math.min(this.cursorRow, newLines.length - 1);
      this.cursorCol = Math.min(this.cursorCol, [...newLines[this.cursorRow]].length);
    }
  }
  public onChange?: (val: string) => void;
  public placeholder = "";
  public lineNumbers = true;
  public language = "text";

  /** Validation; see {@link attachFieldValidation}. */
  public readonly validation: FieldValidation = attachFieldValidation(this, () => this.value);

  private cursorRow = 0;
  private cursorCol = 0;
  private scrollX = 0;
  private scrollY = 0;

  private _focused = false;
  private blinkInterval: any = null;
  private cursorVisible = true;

  constructor() {
    super("textarea");
    this.focusable = true;
    this.defaultStyle = { height: 10 };

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

    const lines = this.value.split(/\r?\n/);
    const originalValue = this.value;

    const contentRect = this.getContentRect();
    const viewportHeight = contentRect.height;
    const gutterWidth = this.lineNumbers ? Math.max(2, String(lines.length).length) + 3 : 0;
    const textViewportWidth = Math.max(0, contentRect.width - gutterWidth);

    const keyName = ev.name || ev.key;

    if (keyName === "up") {
      this.cursorRow = Math.max(0, this.cursorRow - 1);
      this.cursorCol = Math.min(this.cursorCol, [...lines[this.cursorRow]].length);
    } else if (keyName === "down") {
      this.cursorRow = Math.min(lines.length - 1, this.cursorRow + 1);
      this.cursorCol = Math.min(this.cursorCol, [...lines[this.cursorRow]].length);
    } else if (keyName === "left") {
      if (this.cursorCol > 0) {
        this.cursorCol--;
      } else if (this.cursorRow > 0) {
        this.cursorRow--;
        this.cursorCol = [...lines[this.cursorRow]].length;
      }
    } else if (keyName === "right") {
      if (this.cursorCol < [...lines[this.cursorRow]].length) {
        this.cursorCol++;
      } else if (this.cursorRow < lines.length - 1) {
        this.cursorRow++;
        this.cursorCol = 0;
      }
    } else if (keyName === "home") {
      this.cursorCol = 0;
    } else if (keyName === "end") {
      this.cursorCol = [...lines[this.cursorRow]].length;
    } else if (keyName === "pageup") {
      this.cursorRow = Math.max(0, this.cursorRow - viewportHeight + 1);
      this.cursorCol = Math.min(this.cursorCol, [...lines[this.cursorRow]].length);
    } else if (keyName === "pagedown") {
      this.cursorRow = Math.min(lines.length - 1, this.cursorRow + viewportHeight - 1);
      this.cursorCol = Math.min(this.cursorCol, [...lines[this.cursorRow]].length);
    } else if (keyName === "backspace") {
      if (this.cursorCol > 0) {
        const chars = [...lines[this.cursorRow]];
        chars.splice(this.cursorCol - 1, 1);
        lines[this.cursorRow] = chars.join("");
        this.cursorCol--;
      } else if (this.cursorRow > 0) {
        const prevRow = this.cursorRow - 1;
        const prevLen = [...lines[prevRow]].length;
        lines[prevRow] = lines[prevRow] + lines[this.cursorRow];
        lines.splice(this.cursorRow, 1);
        this.cursorRow = prevRow;
        this.cursorCol = prevLen;
      }
      this._value = lines.join("\n");
    } else if (keyName === "delete") {
      const chars = [...lines[this.cursorRow]];
      if (this.cursorCol < chars.length) {
        chars.splice(this.cursorCol, 1);
        lines[this.cursorRow] = chars.join("");
      } else if (this.cursorRow < lines.length - 1) {
        lines[this.cursorRow] = lines[this.cursorRow] + lines[this.cursorRow + 1];
        lines.splice(this.cursorRow + 1, 1);
      }
      this._value = lines.join("\n");
    } else if (keyName === "enter") {
      const chars = [...lines[this.cursorRow]];
      const line1 = chars.slice(0, this.cursorCol).join("");
      const line2 = chars.slice(this.cursorCol).join("");
      lines[this.cursorRow] = line1;
      lines.splice(this.cursorRow + 1, 0, line2);
      this.cursorRow++;
      this.cursorCol = 0;
      this._value = lines.join("\n");
    } else if (keyName === "tab") {
      const chars = [...lines[this.cursorRow]];
      chars.splice(this.cursorCol, 0, " ", " ");
      lines[this.cursorRow] = chars.join("");
      this.cursorCol += 2;
      this._value = lines.join("\n");
    } else if (ev.key && ev.key.length === 1) {
      const chars = [...lines[this.cursorRow]];
      chars.splice(this.cursorCol, 0, ev.key);
      lines[this.cursorRow] = chars.join("");
      this.cursorCol++;
      this._value = lines.join("\n");
    }

    // Adjust scroll view to keep cursor in view
    this.keepCursorInView(lines, viewportHeight, textViewportWidth);

    if (this._value !== originalValue) {
      this.onChange?.(this._value);
      this.validation.maybeValidate("change");
    }
  }

  private keepCursorInView(lines: string[], viewportHeight: number, textViewportWidth: number) {
    if (viewportHeight <= 0 || textViewportWidth <= 0) return;

    // Vertical scroll alignment
    if (this.cursorRow < this.scrollY) {
      this.scrollY = this.cursorRow;
    } else if (this.cursorRow >= this.scrollY + viewportHeight) {
      this.scrollY = this.cursorRow - viewportHeight + 1;
    }
    const maxScrollY = Math.max(0, lines.length - viewportHeight);
    this.scrollY = Math.max(0, Math.min(maxScrollY, this.scrollY));

    // Horizontal scroll alignment
    if (this.cursorCol < this.scrollX) {
      this.scrollX = this.cursorCol;
    } else if (this.cursorCol >= this.scrollX + textViewportWidth) {
      this.scrollX = this.cursorCol - textViewportWidth + 1;
    }
    const maxLineLen = [...lines[this.cursorRow]].length;
    const maxScrollX = Math.max(0, maxLineLen - textViewportWidth + 1);
    this.scrollX = Math.max(0, Math.min(maxScrollX, this.scrollX));
  }

  public override handleMouse(ev: any): void {
    super.handleMouse(ev);
    if (ev.handled) return;

    if (ev.type === "press" && ev.button === "left") {
      const contentRect = this.getContentRect();
      const lines = this.value.split(/\r?\n/);
      const gutterWidth = this.lineNumbers ? Math.max(2, String(lines.length).length) + 3 : 0;

      const clickRow = ev.y - contentRect.y;
      const clickCol = ev.x - contentRect.x;

      const absoluteRow = this.scrollY + clickRow;
      const absoluteCol = this.scrollX + (clickCol - gutterWidth);

      this.cursorRow = Math.max(0, Math.min(lines.length - 1, absoluteRow));
      this.cursorCol = Math.max(0, Math.min([...lines[this.cursorRow]].length, absoluteCol));

      // Reset blink timer so caret is solid on click
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
        this.validation.maybeValidate("blur");
      }
    }

    if (this.computedStyle.border === undefined) {
      this.computedStyle.border = "rounded";
    }
    const severityColor = this.validation.resolveColor();
    if (severityColor) {
      this.computedStyle.borderColor = severityColor;
    }
    super.render(buffer);

    const contentRect = this.getContentRect();
    const lines = this.value.split(/\r?\n/);

    const viewportHeight = contentRect.height;
    const gutterWidth = this.lineNumbers ? Math.max(2, String(lines.length).length) + 3 : 0;
    const textViewportWidth = Math.max(0, contentRect.width - gutterWidth);

    const fg = this.computedStyle.color || "default";
    const bg = this.findResolvedBackground();
    const baseStyle = new Style({ color: fg, background: bg });
    const gutterColor = App.instance?.cssResolver.resolveVariable(this, "$gutter") || "gray";
    const gutterStyle = new Style({ color: gutterColor, background: bg });

    // Render highlighted lines using Syntax engine
    const richLines = Syntax.renderToLines(this.value, this.language, false, this.theme || "theme");

    let currentY = contentRect.y;
    for (let i = 0; i < viewportHeight; i++) {
      const lineIndex = this.scrollY + i;
      if (lineIndex >= lines.length) {
        // Draw filler character for gutter beyond line limits if needed
        if (this.lineNumbers && currentY < contentRect.bottom) {
          const fillerGutter = `${" ".repeat(Math.max(2, String(lines.length).length))} │ `;
          const drawX = contentRect.x;
          for (let j = 0; j < fillerGutter.length; j++) {
            buffer.setCell(drawX + j, currentY, fillerGutter[j], gutterStyle);
          }
        }
        currentY++;
        continue;
      }

      if (currentY >= contentRect.bottom) {
        break; // clip vertically
      }

      // 1. Draw Gutter (Line Number)
      if (this.lineNumbers) {
        const lineNumStr = String(lineIndex + 1).padStart(Math.max(2, String(lines.length).length));
        const gutterText = `${lineNumStr} │ `;
        const drawX = contentRect.x;
        for (let j = 0; j < gutterText.length; j++) {
          buffer.setCell(drawX + j, currentY, gutterText[j], gutterStyle);
        }
      }

      // 2. Build cell representations of the line content
      const cells: { char: string; style: Style }[] = [];

      if (this.value === "" && this.placeholder && lineIndex === 0) {
        const phColor = App.instance?.cssResolver.resolveVariable(this, "$placeholder") || "gray";
        const placeholderStyle = new Style({ color: phColor, background: bg });
        const phChars = [...this.placeholder];
        for (const char of phChars) {
          cells.push({ char, style: placeholderStyle });
        }
      } else {
        const richLine = richLines[lineIndex] || new RichText("");
        const segments = richLine.toSegments(baseStyle);
        for (const segment of segments) {
          const resolvedColor = segment.style.color
            ? App.instance?.cssResolver.resolveVariable(this, segment.style.color) ||
              segment.style.color
            : undefined;
          const resolvedStyle = segment.style.merge({ color: resolvedColor });
          const chars = [...segment.text];
          for (const char of chars) {
            cells.push({ char, style: resolvedStyle });
          }
        }
      }

      // 3. Render Cursor cell (reverse video)
      if (this.focused && this.cursorVisible && lineIndex === this.cursorRow) {
        const focusColor = App.instance?.cssResolver.resolveVariable(this, "$focus") || fg;
        if (this.cursorCol === cells.length) {
          cells.push({ char: "█", style: new Style({ color: focusColor, background: bg }) });
        } else if (this.cursorCol < cells.length) {
          cells[this.cursorCol].style = new Style({ color: bg, background: focusColor });
        }
      }

      // 4. Draw sliced visible cells using safe width accumulation
      let currentWidth = 0;
      let cellIndex = this.scrollX;
      const visibleCells: typeof cells = [];
      while (cellIndex < cells.length && currentWidth < textViewportWidth) {
        const cell = cells[cellIndex];
        const cellW = stringWidth(cell.char);
        if (currentWidth + cellW > textViewportWidth) {
          break;
        }
        visibleCells.push(cell);
        currentWidth += cellW;
        cellIndex++;
      }

      let drawX = contentRect.x + gutterWidth;
      for (const cell of visibleCells) {
        if (drawX >= contentRect.right) break;
        buffer.setCell(drawX, currentY, cell.char, cell.style);
        drawX += stringWidth(cell.char);
      }

      currentY++;
    }
  }
}
