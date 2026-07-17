import { App } from "../../core/app.ts";
import { Screen } from "../../dom/screen.ts";
import { Widget } from "../../dom/widget.ts";
import type { KeyEvent, MouseEvent } from "../../driver/driver.ts";
import type { Region } from "../../geometry/region.ts";
import type { ScreenBuffer } from "../../render/buffer.ts";
import { Segment, stringWidth } from "../../render/segment.ts";
import { Style } from "../../render/style.ts";
import { CompletionPopupWidget } from "./chat/completion-popup.ts";
import { caretRowCol, indexAtRowCol, layoutRows, type VisualRow } from "./chat/layout.ts";
import { ChatBuffer, type ChipSerializer, type ChipToken, isChip } from "./chat/model.ts";
import type { Attachment, Command, Completion, Trigger } from "./chat/types.ts";
import { blendCaretColors, CaretBlink, smoothCaretIntensity } from "./internal/caret.ts";

const SEND_GLYPH = "⏎";
const STOP_GLYPH = "■";
const GHOST_MARKER = "→";
let chipSeq = 0;

/**
 * One contextual help entry for the hint line below the composer: a key glyph
 * and what it does. Hosts render these however they like (see {@link
 * ChatInputWidget.getHints}); the widget recomputes them as the editing mode
 * changes (popup open, browsing history, a suggestion offered, busy, …).
 */
export interface ChatHint {
  /** The key(s) to press, already glyph-formatted (e.g. "⏎", "↑↓", "esc"). */
  keys: string;
  /** What pressing them does (e.g. "send", "accept", "history"). */
  label: string;
  /** Coarse bucket so hosts can group/colour or drop the lowest priority first. */
  group?: "nav" | "edit" | "action";
}

/** Styling for {@link formatChatHints}; values are console-markup style strings. */
export interface ChatHintMarkupOptions {
  /** Style applied to each hint's `keys` (default `"$accent"`). */
  keyStyle?: string;
  /** Style applied to each hint's `label` (default none → inherits the line). */
  labelStyle?: string;
  /** Style applied to the separator between hints (default `"$dimmed"`). */
  sepStyle?: string;
  /** Separator text between hints (default `" │ "`). */
  sep?: string;
}

/** Escape the console-markup metacharacters so literal `[`/`]`/`\` survive. */
function escapeMarkup(s: string): string {
  return s.replace(/([[\]\\])/g, "\\$1");
}

/**
 * Render {@link ChatHint}s as a console-markup string for a markup-capable
 * `Label` (or `Footer`), colouring the keys distinctly from their labels. The
 * defaults use theme variables (`$accent` keys, `$dimmed` separators), so the
 * hint line stays theme-aware. Example output:
 * `"[$accent]⏎[/] send[$dimmed] │ [/][$accent]^j[/] newline"`.
 */
export function formatChatHints(hints: ChatHint[], opts: ChatHintMarkupOptions = {}): string {
  const { keyStyle = "$accent", labelStyle, sepStyle = "$dimmed", sep = " │ " } = opts;
  const wrap = (style: string | undefined, text: string) =>
    style ? `[${style}]${escapeMarkup(text)}[/]` : escapeMarkup(text);
  const sepMarkup = wrap(sepStyle, sep);
  return hints.map((h) => `${wrap(keyStyle, h.keys)} ${wrap(labelStyle, h.label)}`).join(sepMarkup);
}

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
  protected override defaultCursor() {
    return "text" as const;
  }

  private buffer = new ChatBuffer();

  // ── host-set configuration ─────────────────────────────────────────────────
  /** Hint shown when empty. */
  public placeholder = "Message…";
  /** App flips this true while the agent is generating (shows the stop affordance). */
  private _busy = false;
  public get busy(): boolean {
    return this._busy;
  }
  public set busy(v: boolean) {
    if (v === this._busy) return;
    this._busy = v;
    this.refreshHints();
  }
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
  /**
   * Extra host-supplied hints always appended to {@link getHints} (e.g. a quit
   * hint, "drag a file to attach", or any custom contextual message). Setting it
   * re-emits {@link onHintsChange}.
   */
  public get extraHints(): ChatHint[] {
    return this._extraHints;
  }
  public set extraHints(v: ChatHint[]) {
    this._extraHints = v ?? [];
    this.refreshHints();
  }

  // ── host callbacks (declared as the universal supertype on the base) ─────────
  public declare onChange?: (value: string) => void;
  public declare onSubmit?: (value: string, attachments: Attachment[]) => void;
  public declare onInterrupt?: () => void;
  public declare onCommand?: (name: string, args?: unknown) => void;
  public declare onAttach?: (item: Attachment) => void;
  public declare onAttachRemove?: (id: string) => void;
  /**
   * Fires whenever the active contextual hint set changes (mode transitions, not
   * every keystroke). The host renders these as a help line below the composer.
   */
  public declare onHintsChange?: (hints: ChatHint[]) => void;

  // ── internal state ──────────────────────────────────────────────────────────
  private attachments: Attachment[] = [];
  private scrollRow = 0;
  private _focused = false;
  // Blink ticks change only the caret cell's appearance, never layout, so they
  // repaint without relaying out the tree.
  private caret = new CaretBlink(() => this.app?.queueRepaint(this.region, "caret:chat-input"));

  private popup: CompletionPopupWidget | null = null;
  private popupScreen: Screen | null = null;
  private activeTrigger: Trigger | null = null;
  private queryStart = 0;
  private completionReq = 0;

  private suggestion: string | null = null;
  private suggestionReq = 0;

  private historyIndex: number | null = null;
  private draftStash = "";
  /**
   * True once the user has actually put content into the composer this turn
   * (tracked by the first non-empty buffer, not the live length — so deleting
   * back to empty keeps it dirty). Reset when the composer is emptied via
   * submit/clear/controlled-set. Gates the history hint: history is only offered
   * on a pristine composer.
   */
  private hasInput = false;

  private _extraHints: ChatHint[] = [];
  /** Signature of the last-emitted hint set, to suppress no-op re-emits. */
  private lastHintSig = "";

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
    // Close any open completion popup first — it anchors on `queryStart`, a
    // position into the *old* buffer contents, which setValue() below
    // invalidates. Left open, accepting the completion afterward would
    // replaceRange() over the wrong span and corrupt the new text.
    this.closePopup();
    this.buffer.setValue(text);
    this.hasInput = text.length > 0;
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
    this.hasInput = false;
    this.resetHistory();
    this.closePopup();
    this.emitChange();
    this.app?.queueRender();
  }
  /** Insert text at the caret (replacing any selection); used by Ctrl+V + bracketed paste. */
  public insertText(text: string): void {
    this.buffer.insertText(text, "paste");
    this.afterEdit();
  }

  // ── selection clipboard ──────────────────────────────────────────────────────
  // The ClipboardWidget contract shared with Input and TextArea. The App routes
  // Ctrl+C (selection-aware, falls through to quit when empty), Ctrl+Shift+C,
  // Ctrl+Shift+X, Ctrl+A and Escape-to-deselect to these methods.

  /** True when a non-empty selection exists. */
  public hasSelection(): boolean {
    return this.buffer.hasSelection();
  }

  /** Selected text, or null when nothing is selected. */
  public copySelection(): string | null {
    if (!this.buffer.hasSelection()) return null;
    const text = this.buffer.selectedText();
    App.instance?.driver.clipboard.set(text);
    return text;
  }

  /** Copy the selection, then delete it. No-op (null) when nothing is selected. */
  public cutSelection(): string | null {
    const text = this.copySelection();
    if (text === null) return null;
    this.buffer.backspace();
    this.afterEdit();
    return text;
  }

  /** Clear any active selection (caret stays put). */
  public clearSelection(): void {
    this.buffer.clearSelection();
    this.app?.queueRender();
  }

  /** Select the entire draft. */
  public selectAll(): void {
    this.buffer.selectAll();
    this.app?.queueRender();
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

  /**
   * Claim Tab only when there's something to accept in-widget: an open
   * completion popup, or an inline suggestion when Tab is the accept key. In
   * every other state Tab falls through to focus traversal, so a second Tab
   * (after accepting) moves to the next widget.
   */
  public override wantsTab(ev: KeyEvent): boolean {
    // Shift+Tab always navigates focus backward — only claim a forward Tab.
    if (ev.shift) return false;
    if (this.popup) return true;
    return this.suggestion !== null && this.acceptSuggestionKey === "tab";
  }

  public override onUnmount(): void {
    this.caret.stop();
    this.closePopup();
    super.onUnmount();
  }

  private emitChange(): void {
    this.onChange?.(this.buffer.value);
  }

  // ── contextual hints ──────────────────────────────────────────────────────
  /** The glyph the host should press to accept ghost text. */
  private acceptKeyGlyph(): string {
    switch (this.acceptSuggestionKey) {
      case "tab":
        return "⇥";
      case "ctrl-e":
        return "^e";
      default:
        return "→";
    }
  }

  /**
   * The contextual help entries for the current editing mode — the most specific
   * mode wins, then the host's {@link extraHints} are appended. Hosts render
   * these as a help line below the composer; {@link onHintsChange} fires when the
   * set changes so a line can repaint only on real transitions.
   */
  public getHints(): ChatHint[] {
    const hints: ChatHint[] = [];
    if (this.popup) {
      hints.push(
        { keys: "↑↓", label: "navigate", group: "nav" },
        { keys: "⏎", label: "select", group: "action" },
        { keys: "esc", label: "dismiss", group: "action" },
      );
    } else if (this.historyIndex !== null) {
      hints.push(
        { keys: "↑↓", label: "history", group: "nav" },
        { keys: "esc", label: "draft", group: "action" },
      );
    } else if (this.busy) {
      hints.push({ keys: "esc", label: "interrupt", group: "action" });
    } else if (this.suggestion) {
      hints.push(
        { keys: this.acceptKeyGlyph(), label: "accept", group: "action" },
        { keys: "⏎", label: "send", group: "action" },
      );
    } else if (this.buffer.hasSelection()) {
      hints.push(
        { keys: "^c", label: "copy", group: "edit" },
        { keys: "^x", label: "cut", group: "edit" },
        { keys: "⏎", label: "send", group: "action" },
      );
    } else {
      const sendKey = this.submitMode === "enter" ? "⏎" : "^⏎";
      const nlKey = this.submitMode === "enter" ? "^j" : "⏎";
      hints.push(
        { keys: sendKey, label: "send", group: "action" },
        { keys: nlKey, label: "newline", group: "edit" },
      );
      // Only advertise history on a pristine composer — once the user has
      // entered anything this turn, ↑ moves the caret rather than recalling.
      if (this.getHistory && !this.hasInput)
        hints.push({ keys: "↑", label: "history", group: "nav" });
      const chars = this.triggers.map((t) => t.char).join(" ");
      if (chars) hints.push({ keys: chars, label: "completions", group: "nav" });
      for (const cmd of this.commands) {
        if (cmd.key && cmd.label) hints.push({ keys: cmd.key, label: cmd.label, group: "action" });
      }
    }
    return hints.concat(this._extraHints);
  }

  /** Recompute hints and emit {@link onHintsChange} only when the set changed. */
  private refreshHints(): void {
    if (!this.onHintsChange) return;
    const hints = this.getHints();
    const sig = hints.map((h) => `${h.keys}\x00${h.label}`).join("\x01");
    if (sig === this.lastHintSig) return;
    this.lastHintSig = sig;
    this.onHintsChange(hints);
  }

  /** After any buffer mutation: re-query triggers/suggestion, repaint, notify. */
  private afterEdit(): void {
    // Once anything lands in the buffer the composer is "dirty" for this turn,
    // and stays dirty even if the user deletes back to empty.
    if (!this.buffer.isEmpty) this.hasInput = true;
    this.emitChange();
    this.refreshTrigger();
    this.requestSuggestion();
    this.app?.queueRender();
  }

  // ── geometry / wrapping ─────────────────────────────────────────────────────
  // Pure wrapping/measurement lives in ./chat/layout.ts; this widget only
  // supplies the current atoms/width/caret and consumes the result.

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
    return layoutRows(this.buffer.getAtoms(), innerWidth, this.softWrap);
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
    const here = caretRowCol(rows, this.buffer.caret);

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
    // Copy/cut/select-all/paste are NOT handled here: the App routes Ctrl+C,
    // Ctrl+Shift+C/X, Ctrl+A and Ctrl+V to the ClipboardWidget methods below,
    // exactly as it does for Input and TextArea. Crucially this lets a bare
    // Ctrl+C with no selection bubble up to the App and quit (selection-aware
    // copy), instead of being silently swallowed here.

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
        // Reached only when the app dispatched Tab here (see wantsTab) but the
        // popup/suggestion accept above didn't consume it — nothing to do; the
        // app moves focus when wantsTab() is false.
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

    const target = indexAtRowCol(rows, here.row + dir, here.col);
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
    this.hasInput = false;
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
    // No trigger is active — invalidate any in-flight completion request so a
    // late-arriving response can't reopen the popup after the trigger text
    // (e.g. "@mention") has already been deleted.
    this.completionReq++;
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
        this.buffer.replaceRange(start, end, result.value);
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
  /** True between a text mouse-press and its release — a drag selection in progress. */
  private dragSelecting = false;

  /** Caret atom-index under a screen point (row clamped to content), or null when empty. */
  private caretIndexAtXY(x: number, y: number): number | null {
    const content = this.getContentRect();
    const strip = this.stripRows();
    const rows = this.layoutRows(this.innerWidth());
    if (rows.length === 0) return 0;
    let localRow = y - content.y - strip + this.scrollRow;
    localRow = Math.max(0, Math.min(rows.length - 1, localRow));
    return indexAtRowCol(rows, localRow, x - content.x);
  }

  public override handleMouse(ev: MouseEvent): void {
    super.handleMouse(ev);
    if (ev.handled || this.isDisabled()) return;
    if (ev.button !== "left") return;

    // Drag extends the caret end of the selection; the press anchored the other.
    if (ev.type === "drag") {
      if (!this.dragSelecting) return;
      const idx = this.caretIndexAtXY(ev.x, ev.y);
      if (idx !== null) {
        if (this.buffer.anchor === null) this.buffer.anchor = this.buffer.caret;
        this.buffer.caret = idx;
        this.app?.queueRender();
      }
      return;
    }

    // A drag-release with a real selection copies it — works on every terminal
    // (no Kitty protocol needed), matching Input and TextArea. A plain click
    // (no drag) collapses the empty anchor.
    if (ev.type === "release") {
      if (this.dragSelecting) {
        if (this.buffer.hasSelection()) this.copySelection();
        else this.buffer.clearSelection();
        this.dragSelecting = false;
      }
      return;
    }

    if (ev.type !== "press") return;
    this.dragSelecting = false;

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

    // Click a chip → copy its serialized text (chips are atomic, not selectable).
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
          break; // a text atom — fall through to caret placement + anchor
        }
      }
    }

    // Place the caret and anchor a (possibly empty) selection here; a following
    // drag extends it and release copies — identical to Input/TextArea. Crucially
    // we do NOT mark the press handled: that lets the App focus this (focusable)
    // widget on click, the same way Input and TextArea get focus.
    const idx = this.caretIndexAtXY(ev.x, ev.y);
    if (idx !== null) {
      this.buffer.caret = idx;
      this.buffer.anchor = idx;
      this.dragSelecting = true;
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

    // Hints derive purely from current state; emitting here (deduped by
    // signature) catches every transition — selection, popup, history, busy —
    // without sprinkling refresh calls through each key handler.
    this.refreshHints();

    super.render(buffer);

    const content = this.getContentRect();
    const innerW = this.innerWidth();
    const resolve = (v: string) => this.app?.cssResolver.resolveVariable(this, v) || v;
    const bg = this.findResolvedBackground();
    const fg = this.computedStyle.color || resolve("$foreground");

    const rows = this.layoutRows(innerW);
    const here = caretRowCol(rows, this.buffer.caret);

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
          x = this.drawChip(buffer, x, y, pa.atom, resolve, bg, content, this.isSelected(pa.index));
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
    content: Region,
    selected = false,
  ): number {
    const accent = resolve("$accent");
    const dim = resolve("$dimmed");
    // A selected chip tints its chrome with the selection background so it reads
    // as part of the selection (matching how text atoms highlight).
    const chipBg = selected ? resolve("$selectionBg") : bg;
    if (this.chipStyle === "bracket") {
      const style = new Style({ color: accent, background: chipBg });
      const delim = new Style({ color: dim, background: chipBg });
      if (x < content.right) buffer.setCell(x, y, "‹", delim);
      buffer.drawSegment(x + 1, y, new Segment(chip.label, style), content);
      const endX = x + 1 + stringWidth(chip.label);
      if (endX < content.right) buffer.setCell(endX, y, "›", delim);
      return endX + 1;
    }
    // fill: a tinted pill with one render-only space of padding each side.
    const pill = new Style({ color: accent, background: selected ? chipBg : resolve("$panel") });
    if (x < content.right) buffer.setCell(x, y, " ", pill);
    buffer.drawSegment(x + 1, y, new Segment(chip.label, pill), content);
    const endX = x + 1 + stringWidth(chip.label);
    if (endX < content.right) buffer.setCell(endX, y, " ", pill);
    return endX + 1;
  }

  private drawCaret(
    buffer: ScreenBuffer,
    content: Region,
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
    content: Region,
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
      buffer.drawSegment(x, y, new Segment(label, pill), content);
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
