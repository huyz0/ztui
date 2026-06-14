/**
 * Public extension types for the chat composer: trigger sources, completion
 * items, command/keymap actions, and attachments. These are plain data so the
 * widget stays state-management- and framework-agnostic — the app supplies
 * providers and callbacks; the widget knows nothing about what `@` or `/` mean.
 */
import type { ChipToken } from "./model.ts";

/** One item in the completion popup. */
export interface Completion {
  /** Text shown in the popup row. */
  label: string;
  /** Optional secondary/dimmed detail shown after the label. */
  detail?: string;
  /** App payload carried onto a resulting chip (or available in onAccept). */
  payload?: unknown;
}

/** What happens when a completion is accepted for a trigger. */
export type TriggerResult =
  /** Splice plain text in place of the trigger query (e.g. a command name). */
  | { kind: "text"; value: string }
  /** Replace the trigger query with an atomic chip (e.g. an @mention). */
  | { kind: "chip"; token: Omit<ChipToken, "id"> & { id?: string } }
  /** Consume the query, insert nothing. */
  | { kind: "dismiss" }
  /** Fire a command event immediately (e.g. a slash command). */
  | { kind: "command"; name: string; args?: unknown };

/**
 * A character-triggered completion source. When `char` is typed (optionally
 * only at the line start), the widget collects the query after it and asks
 * {@link getCompletions}; accepting one calls {@link onAccept} to decide what to
 * splice. Slash-commands and @mentions are just two entries in `triggers[]`.
 */
export interface Trigger {
  /** The trigger character, e.g. "/", "@", "#". */
  char: string;
  /** Require the char to sit at the start of its logical line (e.g. commands). */
  atLineStart?: boolean;
  /** Provide completions for the current query (sync or async). */
  getCompletions: (query: string) => Completion[] | Promise<Completion[]>;
  /** Decide what to do when a completion is accepted. */
  onAccept: (completion: Completion, query: string) => TriggerResult;
}

/**
 * A keybinding-invoked action, independent of buffer text — a command palette
 * entry or a direct hotkey. Distinct from {@link Trigger} (which is about
 * typing into the buffer with completions).
 */
export interface Command {
  /** Stable command name reported via `onCommand`. */
  name: string;
  /** Human label (for a palette). */
  label?: string;
  /** Optional key spec that invokes it directly, e.g. "ctrl+l". */
  key?: string;
  /** Action to run. Return `false` to fall through to default handling. */
  run?: () => unknown;
}

/** An item in the attachment strip above the composer. */
export interface Attachment {
  /** Stable id (used for removal). */
  id: string;
  /** Short label shown on the chip. */
  label: string;
  /** App-defined kind, e.g. "image" | "file" | "paste". */
  kind?: string;
  /** Opaque app payload. */
  payload?: unknown;
}
