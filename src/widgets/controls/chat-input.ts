import { App } from "../../core/app.ts";
import { Screen } from "../../dom/screen.ts";
import { Widget } from "../../dom/widget.ts";
import type { KeyEvent, MouseEvent } from "../../driver/driver.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { charWidth, Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { CompletionPopupWidget } from "./chat/completion-popup.ts";
import {
  type Atom,
  ChatBuffer,
  type ChipSerializer,
  type ChipToken,
  isChip,
} from "./chat/model.ts";
import type { Attachment, Command, Completion, Trigger } from "./chat/types.ts";
import { blendCaretColors, CaretBlink, smoothCaretIntensity } from "./internal/caret.ts";

/** One atom placed on a wrapped visual row, with its display width and start column. */
interface PlacedAtom {
  index: number;
  atom: Atom;
  width: number;
  col: number;
}
interface VisualRow {
  atoms: PlacedAtom[];
  /** First atom index on the row (== caret index at the row's left edge). */
  start: number;
  /** Caret index just past the row's last atom. */
  end: number;
}

const SEND_GLYPH = "⏎";
const STOP_GLYPH = "■";
const GHOST_MARKER = "→";
let chipSeq = 0;

/**
 * A framework-agnostic chat composer for AI-agent UIs. It owns its own edit
 * buffer (so it works with any state system — React, a store, or none), grows
 * with content, sends on Enter, and supports atomic chips, character-triggered
 * completions, keybinding commands, inline ghost-text autocomplete, edit-aware
 * history recall, and an in-border send/stop affordance. See the design note in
 * `docs/chat-input-design.md`.
 *
 * The host sets plain properties (`busy`, `placeholder`, `triggers`, …) and
 * callbacks (`onSubmit`, `onChange`, `onInterrupt`, `onCommand`); the widget
 * announces events and never assumes a render framework.
 */
export class ChatInputWidget extends Widget {
  private buffer = new ChatBuffer();

  // ── host-set configuration ─────────────────────────────────────────────────
  /** Hint shown when empty. */
  public placeholder = "Message…";
  /** App flips this true while the agent is generating (shows the stop affordance). */
  public busy = false;
  /** "enter" → Enter sends, Shift+Enter newline. "modifier-enter" → inverted. */
  public submitMode: "enter" | "modifier-enter" = "enter";
  /** Minimum visible text rows. */
  public minRows = 1;
  /** Maximum visible text rows before the content scrolls. */
  public maxRows = 8;
  /** Wrap long lines instead of scrolling horizontally. */
  public softWrap = true;
  /** Chip visual style. */
  public chipStyle: "fill" | "bracket" = "fill";
  /** Show the in-border send/stop glyph (purely an affordance; Enter/Esc always work). */
  public showActionGlyph = true;
  /** Which key accepts a ghost-text suggestion. */
  public acceptSuggestionKey: "right" | "tab" | "ctrl-e" = "right";
  /**
   * When Up/Down recall history. "bump" (default): only at the buffer's true
   * start (Up) / end (Down), so history never fires mid-edit; the first press on
   * the boundary row just moves the caret to the edge. "row": eager — anywhere
   * on the first/last visual row.
   */
  public historyEdge: "row" | "bump" = "bump";

  /** Character-triggered completion sources (slash, mention, …). */
  public triggers: Trigger[] = [];
  /** Keybinding/palette commands. */
  public commands: Command[] = [];
  /** App-provided inline ghost-text autocomplete. */
  public suggestionProvider?: (ctx: {
    value: string;
    caretOffset: number;
  }) => string | null | Promise<string | null>;
  /** App-provided history (pulled lazily for Up/Down recall). */
  public getHistory?: () => string[];

  // ── host callbacks (declared as the universal supertype on the base) ─────────
  public declare onChange?: (value: string) => void;
  public declare onSubmit?: (value: string, attachments: Attachment[]) => void;
  public declare onInterrupt?: () => void;
  public declare onCommand?: (name: string, args?: unknown) => void;
  public declare onAttach?: (item: Attachment) => void;
  public declare onAttachRemove?: (id: string) => void;

  // ── internal state ──────────────────────────────────────────────────────────
  private attachments: Attachment[] = [];
  private scrollRow = 0;
  private _focused = false;
  // Blink ticks change only the caret cell's appearance, never layout, so they
  // repaint without relaying out the tree.
  private caret = new CaretBlink(() => this.app?.queueRepaint(this.region));

  private popup: CompletionPopupWidget | null = null;
  private popupScreen: Screen | null = null;
  private activeTrigger: Trigger | null = null;
  private queryStart = 0;
  private completionReq = 0;

  private suggestion: string | null = null;
  private suggestionReq = 0;

  private historyIndex: number | null = null;
  private draftStash = "";

  constructor() {
    super("chat-input");
    this.focusable = true;
    this.defaultStyle = { border: "rounded", width: "100%" };
    this.onKey = (ev) => this.handleInputKey(ev as KeyEvent);
  }

  // ── controlled-prop surface (mapped 1:1 by the reconciler) ──────────────────
  /** The serialized text value. */
  public get value(): string {
    return this.buffer.value;
  }
  /** Replace the text (does not emit onChange — avoids controlled-prop loops). */
  public set value(text: string) {
    if (text === this.buffer.value) return;
    this.buffer.setValue(text);
    this.app?.queueRender();
  }
  /** Set how chips serialize into {@link value}. */
  public set serialize(fn: ChipSerializer) {
    this.buffer.setSerializer(fn);
  }

  // ── imperative API ──────────────────────────────────────────────────────────
  /** Clear the composer. */
  public clear(): void {
    this.buffer.setValue("");
    this.attachments = [];
    this.resetHistory();
    this.closePopup();
    this.emitChange();
    this.app?.queueRender();
  }
  /** Insert text at the caret. */
  public insertText(text: string): void {
    this.buffer.insertText(text, "paste");
    this.afterEdit();
  }
  /** Append text from an external stream (e.g. dictation). */
  public appendStreaming(text: string): void {
    this.buffer.caret = this.buffer.length;
    this.buffer.insertText(text, "paste");
    this.afterEdit();
  }
  /** Add an attachment chip (shown in the strip above the input). */
  public addAttachment(item: Attachment): void {
    this.attachments.push(item);
    this.onAttach?.(item);
    this.app?.queueRender();
  }
  /** Remove an attachment by id. */
  public removeAttachment(id: string): void {
    const i = this.attachments.findIndex((a) => a.id === id);
    if (i < 0) return;
    this.attachments.splice(i, 1);
    this.onAttachRemove?.(id);
    this.app?.queueRender();
  }
  /** Undo / redo the buffer. */
  public undo(): void {
    if (this.buffer.undo()) this.afterEdit();
  }
  public redo(): void {
    if (this.buffer.redo()) this.afterEdit();
  }

  public override onUnmount(): void {
    this.caret.stop();
    this.closePopup();
    super.onUnmount();
  }

  private emitChange(): void {
    this.onChange?.(this.buffer.value);
  }

  /** After any buffer mutation: re-query triggers/suggestion, repaint, notify. */
  private afterEdit(): void {
    this.emitChange();
    this.refreshTrigger();
    this.requestSuggestion();
    this.app?.queueRender();
  }

  // ── geometry / wrapping ─────────────────────────────────────────────────────

  /** Display width of one atom (chips include their pill/bracket chrome). */
  private atomWidth(atom: Atom): number {
    if (isChip(atom)) return stringWidth(atom.label) + 2;
    if (atom === "\n") return 0;
    return charWidth(atom);
  }

  /** Rows the attachment strip occupies above the text (0 or 1). */
  private stripRows(): number {
    return this.attachments.length > 0 ? 1 : 0;
  }

  /** Columns reserved at the right edge for the in-border send/stop glyph. */
  private actionGutter(): number {
    return this.showActionGlyph ? 1 : 0;
  }

  /** Width available for text (minus the send-glyph gutter on the right). */
  private innerWidth(): number {
    return Math.max(1, this.getContentRect().width - this.actionGutter());
  }

  /** Wrap the buffer's atoms into visual rows for the given inner width. */
  private layoutRows(innerWidth: number): VisualRow[] {
    const atoms = this.buffer.getAtoms();
    const rows: VisualRow[] = [];
    let cur: PlacedAtom[] = [];
    let col = 0;
    let start = 0;
    const flush = (end: number, hadNewline: boolean) => {
      rows.push({ atoms: cur, start, end });
      cur = [];
      col = 0;
      start = hadNewline ? end + 1 : end;
    };
    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i];
      if (atom === "\n") {
        flush(i, true);
        continue;
      }
      const w = this.atomWidth(atom);
      if (this.softWrap && col + w > innerWidth && cur.length > 0) {
        flush(i, false);
      }
      cur.push({ index: i, atom, width: w, col });
      col += w;
    }
    rows.push({ atoms: cur, start, end: atoms.length });
    return rows;
  }

  /** Locate the visual row + cell column for a caret atom-index. */
  private caretRowCol(rows: VisualRow[]): { row: number; col: number } {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (this.buffer.caret >= row.start && this.buffer.caret <= row.end) {
        let col = 0;
        for (const pa of row.atoms) {
          if (pa.index >= this.buffer.caret) break;
          col += pa.width;
        }
        return { row: r, col };
      }
    }
    const last = rows[rows.length - 1];
    return { row: rows.length - 1, col: last.atoms.reduce((s, a) => s + a.width, 0) };
  }

  /** Map a (row, targetCol) back to a caret atom-index (for Up/Down motion). */
  private indexAtRowCol(rows: VisualRow[], row: number, targetCol: number): number {
    const vr = rows[Math.max(0, Math.min(rows.length - 1, row))];
    if (vr.atoms.length === 0) return vr.start;
    for (const pa of vr.atoms) {
      if (targetCol <= pa.col + Math.floor(pa.width / 2)) return pa.index;
    }
    return vr.end;
  }

  // ── auto-grow ────────────────────────────────────────────────────────────────
  public override measure(maxW: number, maxH: number): void {
    super.measure(maxW, maxH);
    // Height = wrapped rows clamped to [minRows, maxRows], plus border + the
    // attachment strip row when present.
    const b = this.borderSize;
    const inner = Math.max(1, maxW - b.width - this.actionGutter());
    const rows = this.layoutRows(inner).length;
    const textRows = Math.max(this.minRows, Math.min(this.maxRows, rows));
    const strip = this.attachments.length > 0 ? 1 : 0;
    this.measuredHeight = textRows + b.height + strip;
  }

  // ── key handling ─────────────────────────────────────────────────────────────
  private handleInputKey(ev: KeyEvent): void {
    if (this.isDisabled()) return;
    this.caret.visible = true;
    this.caret.start();

    // 1. Popup owns navigation/accept keys while open.
    if (this.popup) {
      if (this.handlePopupKey(ev)) return;
    }

    // 2. Command keybindings (buffer-independent).
    for (const cmd of this.commands) {
      if (cmd.key && cmd.key === ev.key) {
        const res = cmd.run?.();
        this.onCommand?.(cmd.name);
        if (res !== false) {
          ev.handled = true;
          return;
        }
      }
    }

    const name = ev.name || ev.key;
    const shift = !!ev.shift;
    const mod = !!ev.ctrl || !!ev.meta;
    const rows = this.layoutRows(this.innerWidth());
    const here = this.caretRowCol(rows);

    // 3. Ctrl+J is a literal line feed — a universally-reliable "insert newline"
    // that works even on terminals that can't report Shift+Enter.
    if (ev.key === "ctrl+j") {
      this.buffer.insertText("\n", "structural");
      this.afterEdit();
      ev.handled = true;
      return;
    }

    // 4. Submit vs. newline. In "enter" mode Enter sends and Shift/Ctrl+Enter
    // makes a newline; "modifier-enter" inverts it (Enter newline, mod sends).
    if (name === "enter" || name === "return") {
      // A trailing backslash + Enter is a line continuation: drop the "\" and
      // insert a newline instead of sending (shell-style).
      if (!this.buffer.hasSelection() && this.buffer.getAtoms()[this.buffer.caret - 1] === "\\") {
        this.buffer.backspace();
        this.buffer.insertText("\n", "structural");
        this.afterEdit();
        ev.handled = true;
        return;
      }
      const newlineChord = shift || !!ev.ctrl;
      const wantsSend = this.submitMode === "enter" ? !newlineChord : newlineChord;
      if (wantsSend) {
        this.submit();
      } else {
        this.buffer.insertText("\n", "structural");
        this.afterEdit();
      }
      ev.handled = true;
      return;
    }

    // 4. Esc: interrupt when busy, else clear selection.
    if (name === "escape" || name === "esc") {
      if (this.busy) this.onInterrupt?.();
      else this.buffer.clearSelection();
      this.app?.queueRender();
      ev.handled = true;
      return;
    }

    // 5. Ghost-text accept (Right at end-of-line; Tab/Ctrl+E when opted in).
    if (this.suggestion) {
      const atLineEnd = this.buffer.caret === this.buffer.lineEnd(this.buffer.caret);
      const isAcceptKey =
        (this.acceptSuggestionKey === "right" && name === "right" && atLineEnd) ||
        (this.acceptSuggestionKey === "tab" && name === "tab") ||
        (this.acceptSuggestionKey === "ctrl-e" && ev.key === "ctrl+e");
      if (isAcceptKey) {
        this.buffer.insertText(this.suggestion, "paste");
        this.suggestion = null;
        this.afterEdit();
        ev.handled = true;
        return;
      }
    }

    // 6. Clipboard + undo.
    if (ev.key === "ctrl+z" || ev.key === "meta+z") {
      this.undo();
      ev.handled = true;
      return;
    }
    if (ev.key === "ctrl+y" || ev.key === "ctrl+shift+z" || ev.key === "meta+shift+z") {
      this.redo();
      ev.handled = true;
      return;
    }
    if (ev.key === "ctrl+a" || ev.key === "meta+a") {
      this.buffer.selectAll();
      this.app?.queueRender();
      ev.handled = true;
      return;
    }
    if (ev.key === "ctrl+c" || ev.key === "meta+c") {
      if (this.buffer.hasSelection())
        App.instance?.driver.clipboard.set(this.buffer.selectedText());
      ev.handled = true;
      return;
    }
    if (ev.key === "ctrl+x" || ev.key === "meta+x") {
      if (this.buffer.hasSelection()) {
        App.instance?.driver.clipboard.set(this.buffer.selectedText());
        this.buffer.backspace();
        this.afterEdit();
      }
      ev.handled = true;
      return;
    }

    // 7. Navigation.
    switch (name) {
      case "left":
        this.buffer.moveHorizontal(-1, shift);
        ev.handled = true;
        this.app?.queueRender();
        return;
      case "right":
        this.buffer.moveHorizontal(1, shift);
        ev.handled = true;
        this.app?.queueRender();
        return;
      case "home":
        this.buffer.moveLineEdge(-1, shift);
        ev.handled = true;
        this.app?.queueRender();
        return;
      case "end":
        this.buffer.moveLineEdge(1, shift);
        ev.handled = true;
        this.app?.queueRender();
        return;
      case "up":
        this.handleVertical(-1, here, rows, shift);
        ev.handled = true;
        return;
      case "down":
        this.handleVertical(1, here, rows, shift);
        ev.handled = true;
        return;
      case "backspace":
        this.buffer.backspace();
        this.afterEdit();
        ev.handled = true;
        return;
      case "delete":
        this.buffer.deleteForward();
        this.afterEdit();
        ev.handled = true;
        return;
      case "tab":
        // Not consumed (no suggestion accept) → let focus traversal handle it.
        return;
    }

    // 8. Printable character.
    if (ev.key && [...ev.key].length === 1 && !mod) {
      this.buffer.insertText(ev.key, "type");
      this.afterEdit();
      ev.handled = true;
    }
  }

  /**
   * Up/Down: step through history when browsing it; otherwise move the caret a
   * row, recalling history only at the buffer's true start (Up) / end (Down).
   */
  private handleVertical(
    dir: -1 | 1,
    here: { row: number; col: number },
    rows: VisualRow[],
    shift: boolean,
  ): void {
    // Once browsing history, Up/Down keep stepping through it regardless of the
    // caret — the position gate only governs *entering* history from the draft.
    if (this.historyIndex !== null && this.getHistory && !shift) {
      this.recallHistory(dir);
      return;
    }

    const atEdgeRow = dir < 0 ? here.row === 0 : here.row === rows.length - 1;
    const atBufferEdge =
      dir < 0 ? this.buffer.caret === 0 : this.buffer.caret === this.buffer.length;
    // "bump" (default): only enter history when the caret is at the very start
    // (Up) / end (Down) of the buffer, so it never fires mid-edit. "row": the
    // eager variant — anywhere on the first/last visual row.
    const enterRecall = this.historyEdge === "row" ? atEdgeRow : atBufferEdge;
    if (enterRecall && this.getHistory && !shift) {
      this.recallHistory(dir);
      return;
    }

    if (atEdgeRow) {
      // On the boundary row but not (yet) recalling: move the caret to the
      // buffer edge, so a *second* Up/Down then recalls — the classic
      // move-to-edge-then-history feel. Shift extends a selection there.
      if (shift && this.buffer.anchor === null) this.buffer.anchor = this.buffer.caret;
      else if (!shift) this.buffer.clearSelection();
      this.buffer.caret = dir < 0 ? 0 : this.buffer.length;
      this.app?.queueRender();
      return;
    }

    const target = this.indexAtRowCol(rows, here.row + dir, here.col);
    if (shift && this.buffer.anchor === null) this.buffer.anchor = this.buffer.caret;
    if (!shift) this.buffer.clearSelection();
    this.buffer.caret = target;
    this.app?.queueRender();
  }

  private recallHistory(dir: -1 | 1): void {
    const hist = this.getHistory?.() ?? [];
    if (hist.length === 0) return;
    if (this.historyIndex === null) {
      if (dir > 0) return; // already on the live draft, nothing newer
      this.draftStash = this.buffer.value;
      this.historyIndex = hist.length - 1;
    } else {
      this.historyIndex += dir > 0 ? 1 : -1;
    }
    if (this.historyIndex >= hist.length) {
      // Past the newest entry → restore the stashed draft.
      this.historyIndex = null;
      this.buffer.setValue(this.draftStash);
    } else {
      this.historyIndex = Math.max(0, this.historyIndex);
      this.buffer.setValue(hist[this.historyIndex]);
    }
    this.emitChange();
    this.app?.queueRender();
  }

  private resetHistory(): void {
    this.historyIndex = null;
    this.draftStash = "";
  }

  private submit(): void {
    const value = this.buffer.value;
    if (value.trim() === "" && this.attachments.length === 0) return;
    const sent = this.attachments.slice();
    this.onSubmit?.(value, sent);
    this.buffer.setValue("");
    this.attachments = [];
    this.resetHistory();
    this.closePopup();
    this.suggestion = null;
    this.emitChange();
    this.app?.queueRender();
  }

  // ── triggers + completion popup ───────────────────────────────────────────────
  private refreshTrigger(): void {
    for (const trigger of this.triggers) {
      const q = this.buffer.triggerQuery(trigger.char, !!trigger.atLineStart);
      if (q) {
        this.activeTrigger = trigger;
        this.queryStart = q.start;
        const reqId = ++this.completionReq;
        Promise.resolve(trigger.getCompletions(q.query)).then((items) => {
          if (reqId !== this.completionReq) return; // a newer query superseded this
          if (items.length === 0) {
            this.closePopup();
          } else {
            this.openPopup(items);
          }
        });
        return;
      }
    }
    this.closePopup();
  }

  private openPopup(items: Completion[]): void {
    const screen = this.getScreen();
    if (!screen) return;
    if (!this.popup) {
      this.popup = new CompletionPopupWidget();
      this.popup.onChoose = (i) => this.acceptCompletion(i);
      this.popup.onDismiss = () => this.closePopup();
      screen.addOverlay(this.popup);
      this.popupScreen = screen;
    }
    this.popup.items = items;
    this.popup.selectedIndex = Math.min(this.popup.selectedIndex, items.length - 1);
    // Anchor under the trigger char's cell.
    const rows = this.layoutRows(this.innerWidth());
    const content = this.getContentRect();
    for (let r = 0; r < rows.length; r++) {
      const pa = rows[r].atoms.find((a) => a.index === this.queryStart);
      if (pa) {
        this.popup.anchorX = content.x + pa.col;
        this.popup.anchorY = content.y + this.stripRows() + r - this.scrollRow;
        break;
      }
    }
    this.app?.queueRender();
  }

  private closePopup(): void {
    if (!this.popup) return;
    const screen = this.popupScreen ?? this.getScreen();
    screen?.removeOverlay(this.popup);
    this.popup = null;
    this.popupScreen = null;
    this.activeTrigger = null;
    this.app?.queueRender();
  }

  private handlePopupKey(ev: KeyEvent): boolean {
    if (!this.popup) return false;
    const name = ev.name || ev.key;
    if (name === "up") {
      this.popup.selectedIndex =
        (this.popup.selectedIndex - 1 + this.popup.items.length) % this.popup.items.length;
      this.app?.queueRender();
      ev.handled = true;
      return true;
    }
    if (name === "down") {
      this.popup.selectedIndex = (this.popup.selectedIndex + 1) % this.popup.items.length;
      this.app?.queueRender();
      ev.handled = true;
      return true;
    }
    if (name === "enter" || name === "tab") {
      this.acceptCompletion(this.popup.selectedIndex);
      ev.handled = true;
      return true;
    }
    if (name === "escape" || name === "esc") {
      this.closePopup();
      ev.handled = true;
      return true;
    }
    return false;
  }

  private acceptCompletion(index: number): void {
    const trigger = this.activeTrigger;
    const item = this.popup?.items[index];
    if (!trigger || !item) return;
    const q = this.buffer.triggerQuery(trigger.char, !!trigger.atLineStart);
    const queryText = q?.query ?? "";
    const result = trigger.onAccept(item, queryText);
    const start = this.queryStart;
    const end = this.buffer.caret;
    switch (result.kind) {
      case "text":
        this.deleteRange(start, end);
        this.buffer.insertText(result.value, "structural");
        break;
      case "chip": {
        const token: ChipToken = {
          id: result.token.id ?? `chip-${++chipSeq}`,
          label: result.token.label,
          kind: result.token.kind,
          payload: result.token.payload,
        };
        this.buffer.replaceRangeWithChip(start, end, token);
        break;
      }
      case "command":
        // Remove the typed query and fire the command.
        this.deleteRange(start, end);
        this.onCommand?.(result.name, result.args);
        break;
      case "dismiss":
        this.deleteRange(start, end);
        break;
    }
    this.closePopup();
    this.afterEdit();
  }

  /** Delete an atom range by collapsing the caret to its start. */
  private deleteRange(start: number, end: number): void {
    this.buffer.caret = end;
    this.buffer.anchor = start;
    this.buffer.backspace();
  }

  // ── ghost-text suggestion ─────────────────────────────────────────────────────
  private requestSuggestion(): void {
    this.suggestion = null;
    if (!this.suggestionProvider || this.popup) return;
    const reqId = ++this.suggestionReq;
    const ctx = { value: this.buffer.value, caretOffset: this.buffer.caret };
    Promise.resolve(this.suggestionProvider(ctx)).then((sfx) => {
      if (reqId !== this.suggestionReq) return;
      // Only show when the caret is at the very end (continuation semantics).
      if (sfx && this.buffer.caret === this.buffer.length && !this.buffer.hasSelection()) {
        this.suggestion = sfx;
        this.app?.queueRender();
      }
    });
  }

  // ── mouse ─────────────────────────────────────────────────────────────────────
  public override handleMouse(ev: MouseEvent): void {
    super.handleMouse(ev);
    if (ev.handled || this.isDisabled()) return;
    if (ev.type !== "press" || ev.button !== "left") return;

    // Click on the send/stop glyph (bottom-right inside the content).
    if (this.showActionGlyph) {
      const g = this.actionGlyphCell();
      if (ev.x === g.x && ev.y === g.y) {
        if (this.busy) this.onInterrupt?.();
        else this.submit();
        ev.handled = true;
        return;
      }
    }

    const content = this.getContentRect();
    const strip = this.stripRows();

    // Click on an attachment pill's ✕ → remove it.
    if (strip && ev.y === content.y) {
      let x = content.x;
      for (const att of this.attachments) {
        const labelW = stringWidth(` ${att.label} `);
        if (ev.x === x + labelW) {
          this.removeAttachment(att.id);
          ev.handled = true;
          return;
        }
        x += labelW + 2;
      }
    }

    // Click a chip → copy its serialized text.
    const rows = this.layoutRows(this.innerWidth());
    const localRow = ev.y - content.y - strip + this.scrollRow;
    const vr = rows[localRow];
    if (vr) {
      const localX = ev.x - content.x;
      for (const pa of vr.atoms) {
        if (localX >= pa.col && localX < pa.col + pa.width) {
          if (isChip(pa.atom)) {
            App.instance?.driver.clipboard.set(this.buffer.serializeChip(pa.atom));
            ev.handled = true;
            return;
          }
          this.buffer.caret = pa.index;
          this.buffer.clearSelection();
          ev.handled = true;
          this.app?.queueRender();
          return;
        }
      }
      // Past the row's end → caret to row end.
      this.buffer.caret = vr.end;
      this.buffer.clearSelection();
      ev.handled = true;
      this.app?.queueRender();
    }
  }

  private getScreen(): Screen | null {
    let cur: any = this.parent;
    while (cur) {
      if (cur instanceof Screen) return cur;
      cur = cur.parent;
    }
    return null;
  }

  // ── render ─────────────────────────────────────────────────────────────────────
  public override render(buffer: ScreenBuffer): void {
    if (this.focused !== this._focused) {
      this._focused = this.focused;
      if (this.focused) this.caret.start();
      else this.caret.stop();
    }

    super.render(buffer);

    const content = this.getContentRect();
    const innerW = this.innerWidth();
    const resolve = (v: string) => this.app?.cssResolver.resolveVariable(this, v) || v;
    const bg = this.findResolvedBackground();
    const fg = this.computedStyle.color || resolve("$foreground");

    const rows = this.layoutRows(innerW);
    const here = this.caretRowCol(rows);

    // The attachment strip (when present) occupies the first content row; text
    // flows below it.
    const strip = this.stripRows();
    const textTop = content.y + strip;
    if (strip) this.drawAttachmentStrip(buffer, content, textTop - 1, resolve, fg);

    // Keep the caret row in view (vertical scroll past maxRows).
    const visibleRows = Math.max(1, content.height - strip);
    if (here.row < this.scrollRow) this.scrollRow = here.row;
    else if (here.row >= this.scrollRow + visibleRows) this.scrollRow = here.row - visibleRows + 1;
    this.scrollRow = Math.max(0, Math.min(this.scrollRow, Math.max(0, rows.length - visibleRows)));

    // Placeholder when empty.
    if (this.buffer.isEmpty && this.placeholder) {
      const ph = new Style({ color: resolve("$placeholder"), background: bg, dim: true });
      buffer.drawSegment(content.x, textTop, new Segment(this.placeholder, ph), content);
    }

    // Draw visible rows.
    for (let vi = 0; vi < visibleRows; vi++) {
      const r = this.scrollRow + vi;
      const vr = rows[r];
      if (!vr) break;
      const y = textTop + vi;
      let x = content.x;
      for (const pa of vr.atoms) {
        if (isChip(pa.atom)) {
          x = this.drawChip(buffer, x, y, pa.atom, resolve, bg, content);
        } else {
          const sel = this.isSelected(pa.index);
          const style = sel
            ? new Style({
                color: resolve("$selectionFg") || fg,
                background: resolve("$selectionBg"),
              })
            : new Style({ color: fg, background: bg });
          if (x < content.right) buffer.setCell(x, y, pa.atom, style);
          x += pa.width;
        }
      }
    }

    // Ghost-text suggestion (after the caret, only on the caret's visible row).
    if (this.suggestion && this.focused && !this.popup) {
      const gy = textTop + (here.row - this.scrollRow);
      let gx = content.x + here.col;
      const ghost = new Style({ color: resolve("$dimmed"), background: bg, dim: true });
      if (gx < content.right) {
        buffer.setCell(gx, gy, GHOST_MARKER, ghost);
        gx += 1;
      }
      buffer.drawSegment(gx, gy, new Segment(this.suggestion, ghost), content);
    }

    // Caret.
    if (this.focused && (this.caret.visible || this.caret.smooth)) {
      this.drawCaret(buffer, content, textTop, here, fg, bg, resolve);
    }

    // Send/stop glyph: bottom-right, inside the content on the message's last line.
    if (this.showActionGlyph) this.drawActionGlyph(buffer, resolve, rows.length);
  }

  private isSelected(index: number): boolean {
    const r = this.buffer.selectionRange();
    return !!r && index >= r[0] && index < r[1];
  }

  private drawChip(
    buffer: ScreenBuffer,
    x: number,
    y: number,
    chip: ChipToken,
    resolve: (v: string) => string,
    bg: string,
    content: { right: number },
  ): number {
    const accent = resolve("$accent");
    const dim = resolve("$dimmed");
    if (this.chipStyle === "bracket") {
      const style = new Style({ color: accent, background: bg });
      const delim = new Style({ color: dim, background: bg });
      if (x < content.right) buffer.setCell(x, y, "‹", delim);
      buffer.drawSegment(x + 1, y, new Segment(chip.label, style), content as any);
      const endX = x + 1 + stringWidth(chip.label);
      if (endX < content.right) buffer.setCell(endX, y, "›", delim);
      return endX + 1;
    }
    // fill: a tinted pill with one render-only space of padding each side.
    const pill = new Style({ color: accent, background: resolve("$panel") });
    if (x < content.right) buffer.setCell(x, y, " ", pill);
    buffer.drawSegment(x + 1, y, new Segment(chip.label, pill), content as any);
    const endX = x + 1 + stringWidth(chip.label);
    if (endX < content.right) buffer.setCell(endX, y, " ", pill);
    return endX + 1;
  }

  private drawCaret(
    buffer: ScreenBuffer,
    content: { x: number; y: number; right: number },
    textTop: number,
    here: { row: number; col: number },
    fg: string,
    bg: string,
    resolve: (v: string) => string,
  ): void {
    const cy = textTop + (here.row - this.scrollRow);
    const cx = content.x + here.col;
    if (cx < content.x || cx >= content.right) return;
    const focus = resolve("$focus") || fg;
    const intensity = this.caret.smooth ? smoothCaretIntensity(Date.now() - this.caret.solidAt) : 1;
    const existing = buffer.cells[cy]?.[cx];
    const underChar = existing && existing.char !== "" ? existing.char : " ";
    const isBlock = underChar === " ";
    const c = blendCaretColors(intensity, focus, bg, fg, isBlock);
    buffer.setCell(cx, cy, isBlock ? "█" : underChar, new Style(c));
  }

  /** Paint the attachment strip on row `y`: removable pills, each `label ✕`. */
  private drawAttachmentStrip(
    buffer: ScreenBuffer,
    content: { x: number; right: number },
    y: number,
    resolve: (v: string) => string,
    fg: string,
  ): void {
    let x = content.x;
    const pill = new Style({ color: fg, background: resolve("$panel") });
    const close = new Style({ color: resolve("$dimmed"), background: resolve("$panel") });
    for (const att of this.attachments) {
      if (x >= content.right) break;
      const label = ` ${att.label} `;
      buffer.drawSegment(x, y, new Segment(label, pill), content as any);
      const cx = x + stringWidth(label);
      if (cx < content.right) buffer.setCell(cx, y, "✕", close);
      x = cx + 2; // close glyph + a gap before the next pill
    }
  }

  /**
   * The (x, y) cell of the send/stop glyph: the right column inside the content,
   * on the message's last visible line. With auto-grow that coincides with the
   * box bottom; with a fixed taller height it still hugs the last text row.
   */
  private actionGlyphCell(rowCount = this.layoutRows(this.innerWidth()).length): {
    x: number;
    y: number;
  } {
    const content = this.getContentRect();
    const strip = this.stripRows();
    const textTop = content.y + strip;
    const visibleRows = Math.max(1, content.height - strip);
    const lastVisible = Math.max(0, Math.min(rowCount - 1 - this.scrollRow, visibleRows - 1));
    return { x: content.right - 1, y: textTop + lastVisible };
  }

  private drawActionGlyph(
    buffer: ScreenBuffer,
    resolve: (v: string) => string,
    rowCount: number,
  ): void {
    const content = this.getContentRect();
    if (content.width < 1 || content.height < 1) return;
    const empty = this.buffer.isEmpty && this.attachments.length === 0;
    if (empty && !this.busy) return; // nothing to send, nothing running
    const { x: gx, y: gy } = this.actionGlyphCell(rowCount);
    // Blend with whatever the content painted behind it (so it sits on the input
    // background, not the border), like the copy button.
    const underBg = buffer.cells[gy]?.[gx]?.style.background ?? this.findResolvedBackground();
    const color = this.busy ? resolve("$error") : resolve("$accent");
    buffer.setCell(
      gx,
      gy,
      this.busy ? STOP_GLYPH : SEND_GLYPH,
      new Style({ color, background: underBg }),
    );
  }
}
