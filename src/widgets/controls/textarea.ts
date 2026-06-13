import { App } from "../../core/app.ts";
import { Widget } from "../../dom/widget.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Syntax } from "../../render/rich/syntax.ts";
import { RichText } from "../../render/rich/text.ts";
import { splitGraphemes, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { blendCaretColors, SMOOTH_CARET_TICK, smoothCaretIntensity } from "./caret.ts";
import { deleteRange, extractSelection, insertAt, orderPair, type Pos } from "./text-selection.ts";
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
      this.cursorCol === splitGraphemes(oldLines[this.cursorRow]).length;

    this.selectionAnchor = null;
    if (isAtEnd || this._value === "") {
      this.cursorRow = newLines.length - 1;
      this.cursorCol = splitGraphemes(newLines[this.cursorRow]).length;
    } else {
      this.cursorRow = Math.min(this.cursorRow, newLines.length - 1);
      this.cursorCol = Math.min(this.cursorCol, splitGraphemes(newLines[this.cursorRow]).length);
    }
  }
  public declare onChange?: (val: string) => void;
  public placeholder = "";
  public lineNumbers = true;
  public language = "text";

  /** Validation; see {@link attachFieldValidation}. */
  public readonly validation: FieldValidation = attachFieldValidation(this, () => this.value);

  private cursorRow = 0;
  private cursorCol = 0;
  private scrollX = 0;
  private scrollY = 0;
  /** Selection start; null when nothing is selected. The caret end is always
   * {@link cursorRow}/{@link cursorCol}. */
  private selectionAnchor: Pos | null = null;

  private _focused = false;
  private blinkInterval: any = null;
  private cursorVisible = true;
  /** Eased fade-blink (default) instead of a hard on/off toggle. Set false for
   * the classic square-wave blink. */
  public smoothCaret = true;
  /** Timestamp the caret last reset to solid, driving the smooth-blink phase. */
  private caretSolidAt = 0;

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
    this.caretSolidAt = Date.now();
    if (this.blinkInterval) clearInterval(this.blinkInterval);
    if (this.smoothCaret) {
      // Smooth blink: repaint at the animation cadence; opacity is derived from
      // the elapsed phase in render(), not a boolean toggle.
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

    let lines = this.value.split(/\r?\n/);
    const originalValue = this.value;

    const contentRect = this.getContentRect();
    const viewportHeight = contentRect.height;
    const gutterWidth = this.lineNumbers ? Math.max(2, String(lines.length).length) + 3 : 0;
    const textViewportWidth = Math.max(0, contentRect.width - gutterWidth);

    const keyName = ev.name || ev.key;
    const shift = !!ev.shift;
    const startSel = () => {
      if (this.selectionAnchor === null) {
        this.selectionAnchor = { row: this.cursorRow, col: this.cursorCol };
      }
    };

    if (keyName === "up") {
      if (shift) startSel();
      else this.selectionAnchor = null;
      this.cursorRow = Math.max(0, this.cursorRow - 1);
      this.cursorCol = Math.min(this.cursorCol, splitGraphemes(lines[this.cursorRow]).length);
    } else if (keyName === "down") {
      if (shift) startSel();
      else this.selectionAnchor = null;
      this.cursorRow = Math.min(lines.length - 1, this.cursorRow + 1);
      this.cursorCol = Math.min(this.cursorCol, splitGraphemes(lines[this.cursorRow]).length);
    } else if (keyName === "left") {
      if (shift) {
        startSel();
        this.moveLeft(lines);
      } else if (this.hasSelection()) {
        const [start] = this.orderedSelection()!;
        this.cursorRow = start.row;
        this.cursorCol = start.col;
        this.selectionAnchor = null;
      } else {
        this.moveLeft(lines);
      }
    } else if (keyName === "right") {
      if (shift) {
        startSel();
        this.moveRight(lines);
      } else if (this.hasSelection()) {
        const [, end] = this.orderedSelection()!;
        this.cursorRow = end.row;
        this.cursorCol = end.col;
        this.selectionAnchor = null;
      } else {
        this.moveRight(lines);
      }
    } else if (keyName === "home") {
      if (shift) startSel();
      else this.selectionAnchor = null;
      this.cursorCol = 0;
    } else if (keyName === "end") {
      if (shift) startSel();
      else this.selectionAnchor = null;
      this.cursorCol = splitGraphemes(lines[this.cursorRow]).length;
    } else if (keyName === "pageup") {
      if (shift) startSel();
      else this.selectionAnchor = null;
      this.cursorRow = Math.max(0, this.cursorRow - viewportHeight + 1);
      this.cursorCol = Math.min(this.cursorCol, splitGraphemes(lines[this.cursorRow]).length);
    } else if (keyName === "pagedown") {
      if (shift) startSel();
      else this.selectionAnchor = null;
      this.cursorRow = Math.min(lines.length - 1, this.cursorRow + viewportHeight - 1);
      this.cursorCol = Math.min(this.cursorCol, splitGraphemes(lines[this.cursorRow]).length);
    } else if (keyName === "backspace") {
      const after = this.spliceSelection(lines);
      if (after) {
        lines = after;
      } else if (this.cursorCol > 0) {
        const chars = splitGraphemes(lines[this.cursorRow]);
        chars.splice(this.cursorCol - 1, 1);
        lines[this.cursorRow] = chars.join("");
        this.cursorCol--;
      } else if (this.cursorRow > 0) {
        const prevRow = this.cursorRow - 1;
        const prevLen = splitGraphemes(lines[prevRow]).length;
        lines[prevRow] = lines[prevRow] + lines[this.cursorRow];
        lines.splice(this.cursorRow, 1);
        this.cursorRow = prevRow;
        this.cursorCol = prevLen;
      }
      this._value = lines.join("\n");
    } else if (keyName === "delete") {
      const after = this.spliceSelection(lines);
      if (after) {
        lines = after;
      } else {
        const chars = splitGraphemes(lines[this.cursorRow]);
        if (this.cursorCol < chars.length) {
          chars.splice(this.cursorCol, 1);
          lines[this.cursorRow] = chars.join("");
        } else if (this.cursorRow < lines.length - 1) {
          lines[this.cursorRow] = lines[this.cursorRow] + lines[this.cursorRow + 1];
          lines.splice(this.cursorRow + 1, 1);
        }
      }
      this._value = lines.join("\n");
    } else if (keyName === "enter") {
      const after = this.spliceSelection(lines);
      if (after) lines = after;
      const chars = splitGraphemes(lines[this.cursorRow]);
      const line1 = chars.slice(0, this.cursorCol).join("");
      const line2 = chars.slice(this.cursorCol).join("");
      lines[this.cursorRow] = line1;
      lines.splice(this.cursorRow + 1, 0, line2);
      this.cursorRow++;
      this.cursorCol = 0;
      this._value = lines.join("\n");
    } else if (keyName === "tab") {
      const after = this.spliceSelection(lines);
      if (after) lines = after;
      const chars = splitGraphemes(lines[this.cursorRow]);
      chars.splice(this.cursorCol, 0, " ", " ");
      lines[this.cursorRow] = chars.join("");
      this.cursorCol += 2;
      this._value = lines.join("\n");
    } else if (ev.key && splitGraphemes(ev.key).length === 1 && !ev.ctrl && !ev.meta) {
      const after = this.spliceSelection(lines);
      if (after) lines = after;
      const chars = splitGraphemes(lines[this.cursorRow]);
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

  private moveLeft(lines: string[]): void {
    if (this.cursorCol > 0) {
      this.cursorCol--;
    } else if (this.cursorRow > 0) {
      this.cursorRow--;
      this.cursorCol = splitGraphemes(lines[this.cursorRow]).length;
    }
  }

  private moveRight(lines: string[]): void {
    if (this.cursorCol < splitGraphemes(lines[this.cursorRow]).length) {
      this.cursorCol++;
    } else if (this.cursorRow < lines.length - 1) {
      this.cursorRow++;
      this.cursorCol = 0;
    }
  }

  /** True when a non-empty selection exists. */
  public hasSelection(): boolean {
    return (
      this.selectionAnchor !== null &&
      !(this.selectionAnchor.row === this.cursorRow && this.selectionAnchor.col === this.cursorCol)
    );
  }

  /** Ordered `[start, end]` selection positions, or null when none is active. */
  private orderedSelection(): [Pos, Pos] | null {
    if (!this.hasSelection()) return null;
    return orderPair(this.selectionAnchor!, { row: this.cursorRow, col: this.cursorCol });
  }

  /**
   * Delete the active selection from `lines`, returning the new lines array and
   * collapsing the caret to the range start. Returns null when nothing is
   * selected. Commits `this._value` so callers may reuse the returned array.
   */
  private spliceSelection(lines: string[]): string[] | null {
    const ordered = this.orderedSelection();
    if (!ordered) return null;
    const [start, end] = ordered;
    const next = deleteRange(lines, start, end);
    this.cursorRow = start.row;
    this.cursorCol = start.col;
    this.selectionAnchor = null;
    this._value = next.join("\n");
    return next;
  }

  /** Selected text (multi-line joined with `\n`), or null when none is selected. */
  public copySelection(): string | null {
    const ordered = this.orderedSelection();
    if (!ordered) return null;
    const text = extractSelection(this.value.split(/\r?\n/), ordered[0], ordered[1]);
    App.instance?.driver.clipboard.set(text);
    return text;
  }

  /** Copy the selection, then delete it. No-op when nothing is selected. */
  public cutSelection(): string | null {
    const text = this.copySelection();
    if (text === null) return null;
    this.spliceSelection(this.value.split(/\r?\n/));
    this.onChange?.(this._value);
    this.validation.maybeValidate("change");
    App.instance?.queueRender();
    return text;
  }

  /** Clear any active selection (caret stays put). */
  public clearSelection(): void {
    this.selectionAnchor = null;
    App.instance?.queueRender();
  }

  /** Select the entire contents. */
  public selectAll(): void {
    const lines = this.value.split(/\r?\n/);
    this.selectionAnchor = { row: 0, col: 0 };
    this.cursorRow = lines.length - 1;
    this.cursorCol = splitGraphemes(lines[lines.length - 1]).length;
    App.instance?.queueRender();
  }

  /**
   * Replace the selection (or insert at the caret) with `text`, which may span
   * multiple lines. Used by both keyboard paste and bracketed (native) paste.
   */
  public insertText(text: string): void {
    const original = this._value;
    let lines = this.value.split(/\r?\n/);
    const after = this.spliceSelection(lines);
    if (after) lines = after;
    const { lines: nextLines, caret } = insertAt(
      lines,
      { row: this.cursorRow, col: this.cursorCol },
      text,
    );
    this._value = nextLines.join("\n");
    this.cursorRow = caret.row;
    this.cursorCol = caret.col;
    this.selectionAnchor = null;
    if (this._value !== original) {
      this.onChange?.(this._value);
      this.validation.maybeValidate("change");
    }
    App.instance?.queueRender();
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
    const maxLineLen = splitGraphemes(lines[this.cursorRow]).length;
    const maxScrollX = Math.max(0, maxLineLen - textViewportWidth + 1);
    this.scrollX = Math.max(0, Math.min(maxScrollX, this.scrollX));
  }

  /** Map a screen (x, y) to a caret position within the value. */
  private posAtXY(x: number, y: number): Pos {
    const contentRect = this.getContentRect();
    const lines = this.value.split(/\r?\n/);
    const gutterWidth = this.lineNumbers ? Math.max(2, String(lines.length).length) + 3 : 0;
    const row = Math.max(0, Math.min(lines.length - 1, this.scrollY + (y - contentRect.y)));
    const col = Math.max(
      0,
      Math.min(splitGraphemes(lines[row]).length, this.scrollX + (x - contentRect.x - gutterWidth)),
    );
    return { row, col };
  }

  public override handleMouse(ev: any): void {
    super.handleMouse(ev);
    if (ev.handled) return;

    if (ev.button === "left" && (ev.type === "press" || ev.type === "drag")) {
      const pos = this.posAtXY(ev.x, ev.y);
      if (ev.type === "press") {
        // Begin a (possibly empty) selection anchored at the click point.
        this.cursorRow = pos.row;
        this.cursorCol = pos.col;
        this.selectionAnchor = { row: pos.row, col: pos.col };
      } else {
        // Drag extends the caret end; the anchor stays put.
        this.cursorRow = pos.row;
        this.cursorCol = pos.col;
      }
      this.cursorVisible = true;
      this.startBlinking();
      App.instance?.queueRender();
    } else if (ev.type === "release" && ev.button === "left") {
      // Drag-release with a real selection copies it (works on every terminal).
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

    const fg = this.isDisabled()
      ? App.instance?.cssResolver.resolveVariable(this, "$disabled") || "gray"
      : this.computedStyle.color || "default";
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
        const phChars = splitGraphemes(this.placeholder);
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
          const chars = splitGraphemes(segment.text);
          for (const char of chars) {
            cells.push({ char, style: resolvedStyle });
          }
        }
      }

      // 2b. Highlight the selected span on this line.
      const sel = this.orderedSelection();
      if (sel && lineIndex >= sel[0].row && lineIndex <= sel[1].row) {
        const selBg = App.instance?.cssResolver.resolveVariable(this, "$selectionBg") || "#585b70";
        const selFg = App.instance?.cssResolver.resolveVariable(this, "$selectionFg") || fg;
        const selStyle = new Style({ color: selFg, background: selBg });
        const from = lineIndex === sel[0].row ? sel[0].col : 0;
        const to = lineIndex === sel[1].row ? sel[1].col : cells.length;
        for (let i = from; i < to && i < cells.length; i++) {
          cells[i].style = selStyle;
        }
      }

      // 3. Render Cursor cell (eased fade-blink, or reverse video when off)
      if (
        this.focused &&
        (this.cursorVisible || this.smoothCaret) &&
        lineIndex === this.cursorRow
      ) {
        const focusColor = App.instance?.cssResolver.resolveVariable(this, "$focus") || fg;
        const intensity = this.smoothCaret
          ? smoothCaretIntensity(Date.now() - this.caretSolidAt)
          : 1;
        if (this.cursorCol === cells.length) {
          const c = blendCaretColors(intensity, focusColor, bg, fg, true);
          cells.push({ char: "█", style: new Style(c) });
        } else if (this.cursorCol < cells.length) {
          const cellFg = cells[this.cursorCol].style.color || fg;
          const c = blendCaretColors(intensity, focusColor, bg, cellFg, false);
          cells[this.cursorCol].style = new Style(c);
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
