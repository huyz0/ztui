/**
 * Pure edit-buffer model for the chat composer. No DOM/driver imports, so the
 * caret/selection/undo math is trivially unit-testable.
 *
 * The buffer is a flat array of **atoms**. An atom is either a single grapheme
 * cluster (a string) or a {@link ChipToken} — an atomic, non-editable unit
 * (an @mention, a collapsed paste, …). Modelling the document this way is what
 * makes chips "just work": because a chip is one atom, caret motion, deletion,
 * and selection treat it as a single indivisible unit for free, with no special
 * cases in the caret arithmetic.
 *
 * Newlines are ordinary `"\n"` grapheme atoms; logical lines are recovered by
 * splitting on them. Undo/redo is full-snapshot based (simple and bulletproof
 * at chat-input scale, per the design note in `docs/chat-input-design.md`).
 */
import { splitGraphemes } from "../../../render/segment.ts";

/** An atomic, non-editable inline unit in the buffer (e.g. an @mention). */
export interface ChipToken {
  /** Stable id (used for keying/removal). */
  id: string;
  /** Text shown inside the chip. */
  label: string;
  /** App-defined kind (e.g. which trigger produced it). */
  kind?: string;
  /** Opaque app payload (e.g. a resolved file path). */
  payload?: unknown;
}

/** A buffer atom: a single grapheme cluster, or an atomic chip. */
export type Atom = string | ChipToken;

/** True when `a` is a {@link ChipToken} rather than a text grapheme. */
export function isChip(a: Atom): a is ChipToken {
  return typeof a !== "string";
}

/** How a chip serializes into the plain-text {@link ChatBuffer.value}. */
export type ChipSerializer = (token: ChipToken) => string;

const defaultSerialize: ChipSerializer = (t) => t.label;

/** Convert a plain string into text atoms (one grapheme per atom). */
export function atomsFromString(text: string): Atom[] {
  return splitGraphemes(text);
}

interface Snapshot {
  atoms: Atom[];
  caret: number;
  anchor: number | null;
}

/**
 * The composer's editable document: atoms, a caret index, an optional selection
 * anchor, and an undo/redo history. All mutating ops go through here so undo
 * coalescing and the serialized {@link value} stay consistent.
 *
 * Caret/anchor are indices in `[0, atoms.length]` (a caret sits *between*
 * atoms). Because every chip is exactly one atom, Left/Right/Backspace over a
 * chip are the same single-step operations as over a character.
 */
export class ChatBuffer {
  private atoms: Atom[] = [];
  /** Caret position: an index between atoms in `[0, length]`. */
  public caret = 0;
  /** Selection anchor, or null when there is no selection. */
  public anchor: number | null = null;

  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  /** Marks the kind of the last edit so consecutive typing coalesces into one undo step. */
  private lastEditKind: string | null = null;

  constructor(private serialize: ChipSerializer = defaultSerialize) {}

  /** Replace the chip serializer (the host supplies how chips become text). */
  public setSerializer(fn: ChipSerializer): void {
    this.serialize = fn;
  }

  /** Serialize a single chip token with the host serializer. */
  public serializeChip(token: ChipToken): string {
    return this.serialize(token);
  }

  /** Number of atoms. */
  public get length(): number {
    return this.atoms.length;
  }

  /** A shallow copy of the atom array (read-only use). */
  public getAtoms(): readonly Atom[] {
    return this.atoms;
  }

  /** The serialized plain-text value (chips rendered via the serializer). */
  public get value(): string {
    let out = "";
    for (const a of this.atoms) out += isChip(a) ? this.serialize(a) : a;
    return out;
  }

  /** True when the buffer has no atoms. */
  public get isEmpty(): boolean {
    return this.atoms.length === 0;
  }

  // ── snapshots / undo ──────────────────────────────────────────────────────

  private snapshot(): Snapshot {
    return { atoms: this.atoms.slice(), caret: this.caret, anchor: this.anchor };
  }

  private restore(s: Snapshot): void {
    this.atoms = s.atoms.slice();
    this.caret = s.caret;
    this.anchor = s.anchor;
  }

  /**
   * Push the current state onto the undo stack before a mutation, coalescing
   * consecutive edits of the same `kind` (e.g. a run of typed characters) into
   * a single undo step. Structural edits ("paste", "chip", "delete", …) pass a
   * distinct kind so they each become their own step.
   */
  private pushUndo(kind: string): void {
    if (this.lastEditKind !== kind || kind === "structural") {
      this.undoStack.push(this.snapshot());
      // Cap history so a long session can't grow without bound.
      if (this.undoStack.length > 200) this.undoStack.shift();
    }
    this.redoStack = [];
    this.lastEditKind = kind;
  }

  /** Undo the last edit step. Returns true when something was undone. */
  public undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.redoStack.push(this.snapshot());
    this.restore(prev);
    this.lastEditKind = null;
    return true;
  }

  /** Redo the last undone step. Returns true when something was redone. */
  public redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(this.snapshot());
    this.restore(next);
    this.lastEditKind = null;
    return true;
  }

  // ── selection ─────────────────────────────────────────────────────────────

  /** True when a non-empty selection exists. */
  public hasSelection(): boolean {
    return this.anchor !== null && this.anchor !== this.caret;
  }

  /** Ordered `[start, end)` selection bounds, or null when none is active. */
  public selectionRange(): [number, number] | null {
    if (!this.hasSelection()) return null;
    const a = this.anchor as number;
    return a <= this.caret ? [a, this.caret] : [this.caret, a];
  }

  /** Clear any active selection (caret unchanged). */
  public clearSelection(): void {
    this.anchor = null;
  }

  /** Select the entire buffer. */
  public selectAll(): void {
    this.anchor = 0;
    this.caret = this.atoms.length;
  }

  /** Serialized text of the current selection, or "" when none. */
  public selectedText(): string {
    const r = this.selectionRange();
    if (!r) return "";
    let out = "";
    for (let i = r[0]; i < r[1]; i++) {
      const a = this.atoms[i];
      out += isChip(a) ? this.serialize(a) : a;
    }
    return out;
  }

  // ── caret motion ──────────────────────────────────────────────────────────

  /**
   * Move the caret by one atom. With `extend`, grows the selection (anchoring
   * if needed); without, collapses an existing selection to the appropriate
   * edge instead of moving past it (standard editor behavior).
   */
  public moveHorizontal(dir: -1 | 1, extend: boolean): void {
    if (extend) {
      if (this.anchor === null) this.anchor = this.caret;
      this.caret = clamp(this.caret + dir, 0, this.atoms.length);
      return;
    }
    const range = this.selectionRange();
    if (range) {
      this.caret = dir < 0 ? range[0] : range[1];
      this.anchor = null;
      return;
    }
    this.caret = clamp(this.caret + dir, 0, this.atoms.length);
  }

  /** Move the caret to the start (`-1`) or end (`1`) of its logical line. */
  public moveLineEdge(dir: -1 | 1, extend: boolean): void {
    if (extend) {
      if (this.anchor === null) this.anchor = this.caret;
    } else {
      this.anchor = null;
    }
    this.caret = dir < 0 ? this.lineStart(this.caret) : this.lineEnd(this.caret);
  }

  /** Index of the first atom on the logical line containing caret index `i`. */
  public lineStart(i: number): number {
    let j = i;
    while (j > 0 && this.atoms[j - 1] !== "\n") j--;
    return j;
  }

  /** Index just past the last atom on the logical line containing caret index `i`. */
  public lineEnd(i: number): number {
    let j = i;
    while (j < this.atoms.length && this.atoms[j] !== "\n") j++;
    return j;
  }

  // ── mutation ──────────────────────────────────────────────────────────────

  /** Delete the active selection if any; returns true when it removed something. */
  private deleteSelection(): boolean {
    const range = this.selectionRange();
    if (!range) return false;
    this.atoms.splice(range[0], range[1] - range[0]);
    this.caret = range[0];
    this.anchor = null;
    return true;
  }

  /** Insert plain text at the caret (replacing any selection). */
  public insertText(text: string, kind = "type"): void {
    if (text === "") return;
    this.pushUndo(kind);
    this.deleteSelection();
    const graphemes = splitGraphemes(text);
    this.atoms.splice(this.caret, 0, ...graphemes);
    this.caret += graphemes.length;
  }

  /** Insert a chip atom at the caret (replacing any selection). */
  public insertChip(token: ChipToken): void {
    this.pushUndo("structural");
    this.deleteSelection();
    this.atoms.splice(this.caret, 0, token);
    this.caret += 1;
  }

  /**
   * Replace the `[start, end)` atom range with a single chip. Used by triggers:
   * the typed query (e.g. `@aut`) is swapped for the accepted chip. Undoable as
   * one step, so Ctrl+Z reverts the chip back to the raw query text.
   */
  public replaceRangeWithChip(start: number, end: number, token: ChipToken): void {
    this.pushUndo("structural");
    this.atoms.splice(start, end - start, token);
    this.caret = start + 1;
    this.anchor = null;
  }

  /** Backspace: delete the selection, else the atom before the caret. */
  public backspace(): void {
    if (this.hasSelection()) {
      this.pushUndo("structural");
      this.deleteSelection();
      return;
    }
    if (this.caret === 0) return;
    this.pushUndo("delete");
    this.atoms.splice(this.caret - 1, 1);
    this.caret -= 1;
  }

  /** Forward-delete: delete the selection, else the atom at the caret. */
  public deleteForward(): void {
    if (this.hasSelection()) {
      this.pushUndo("structural");
      this.deleteSelection();
      return;
    }
    if (this.caret >= this.atoms.length) return;
    this.pushUndo("delete");
    this.atoms.splice(this.caret, 1);
  }

  /** Replace the whole buffer (resetting caret to the end). Clears history. */
  public setValue(text: string): void {
    this.atoms = atomsFromString(text);
    this.caret = this.atoms.length;
    this.anchor = null;
    this.undoStack = [];
    this.redoStack = [];
    this.lastEditKind = null;
  }

  /** Empty the buffer (undoable as one structural step). */
  public clear(): void {
    if (this.atoms.length === 0) return;
    this.pushUndo("structural");
    this.atoms = [];
    this.caret = 0;
    this.anchor = null;
  }

  // ── trigger query inspection ────────────────────────────────────────────────

  /**
   * If the text immediately before the caret is an active trigger query — the
   * trigger `char` followed by zero or more non-whitespace, non-chip atoms with
   * no intervening break — return its bounds and query string. `atLineStart`
   * additionally requires the trigger char to sit at the start of its logical
   * line. Returns null when no query is active.
   */
  public triggerQuery(char: string, atLineStart: boolean): { start: number; query: string } | null {
    let i = this.caret;
    let query = "";
    while (i > 0) {
      const a = this.atoms[i - 1];
      if (isChip(a)) break;
      if (a === char) {
        // Found the trigger char. Check the line-start constraint.
        if (atLineStart) {
          const prev = this.atoms[i - 2];
          if (i - 1 !== 0 && prev !== "\n") return null;
        }
        return { start: i - 1, query };
      }
      // The query terminates at whitespace/newline.
      if (a === "\n" || a === " " || a === "\t") return null;
      query = a + query;
      i--;
    }
    return null;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
