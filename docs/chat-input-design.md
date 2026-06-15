# ChatInput — design

A framework-agnostic chat composer widget for building AI-agent TUIs/UIs on
ztui. Lives at the **widget-DOM layer** (not React-specific); the React
`<ChatInput>` is a thin adapter and a vanilla/Bun app drives it imperatively.

> **Status: implemented.** `ChatInputWidget` lives at
> [src/widgets/controls/chat-input.ts](../src/widgets/controls/chat-input.ts)
> with the pure buffer model in
> [src/widgets/controls/chat/model.ts](../src/widgets/controls/chat/model.ts),
> the React binding `ChatInput` (`ztui/react`), and a `chat_demo.tsx` gallery
> demo. This note records the decisions and their rationale.

## Goals & non-goals

**Goals**

- A composer tuned for *dispatching conversational turns*, not editing a
  document — distinct from the code-oriented [`TextAreaWidget`](../src/widgets/controls/textarea.ts).
- Works with **any** state-management approach (React, signals, a store, or
  none). No controlled-`value` round-trip per keystroke.
- Works with **any** agent flavor (coding / general chat) via generic,
  data-driven extension points rather than hardcoded features.
- Works on both backends. Where a capability only exists on one backend, it
  degrades gracefully with no layout shift.

**Non-goals**

- Not a full rich-text editor. No tables/headings/etc. in the composer.
- No backend assumptions about what `@mention`/`/command` *mean* — the app
  supplies all of that.

## Core principle: the widget owns the draft; the app owns everything else

The composer is the **source of truth for the in-progress draft**. It mutates
its own buffer on keystrokes and `queueRender()`s itself — zero app involvement
per keystroke. This is what keeps it state-management-agnostic, and it mirrors
how `TextAreaWidget` already owns `_value`.

The **app owns everything around the draft**: conversation history, busy/
streaming state, what a mention resolves to, which commands exist. The widget
*pulls* these via callbacks and *announces* events back. The app wires those to
its own state however it likes.

## The contract (no framework assumptions)

Inputs the app sets (plain properties / callbacks):

- `submitMode: "enter" | "modifier-enter"` — Enter sends vs. Mod+Enter sends.
- `minRows`, `maxRows`, `softWrap`, `placeholder`.
- `busy: boolean` — app flips this while the agent generates; widget shows the
  interrupt affordance. Pure data-in.
- `getHistory?: () => string[]` — pulled lazily for Up/Down recall; app owns
  the array, widget never stores it.
- `suggestionProvider?: (ctx) => string | null | Promise<…>` — inline ghost-text
  autocomplete (see below). App-supplied; widget never guesses content.
- `acceptSuggestionKey: "right" | "tab" | "ctrl-e" | …` — default `"right"`.
- `historyEdge: "row" | "bump"` — default `"bump"` (recall only at the buffer
  start/end, never mid-edit).
- `showActionGlyph: boolean` — default `true`; the in-border send/stop glyph
  (purely an affordance; Enter/Esc always work regardless).
- `triggers: Trigger[]` — char-triggered completion sources (see below).
- `commands: Command[]` — keybinding/palette actions (see below).
- `serialize?: (token) => string` — how a chip becomes text in the submitted
  string (default: the chip label).
- `chipStyle: "fill" | "bracket"` — default `fill`.

Events the widget emits (app wires to its own state):

- `onSubmit(value, attachments)` — the one that matters.
- `onChange(value)`, `onInterrupt()`.
- `onAttach(item)` / `onAttachRemove(id)`.
- `onCommand(name, args)` (when a trigger/command resolves to an action).

Imperative methods (any controller can drive it):

- `clear()`, `setValue(text)`, `insertText(text)`, `focus()`.
- `appendStreaming(text)` — for dictation / external text sources.
- `addAttachment(item)` / `removeAttachment(id)`.
- `undo()` / `redo()`.

The React wrapper maps props → these setters; a vanilla app calls them directly.

## Extension model: two generic registries

We deliberately do **not** hardcode `/` or `@`. There are two orthogonal,
generic systems:

### 1. Trigger registry (character-in-buffer → completions)

```ts
interface Trigger {
  char: string;            // "/", "@", "#", ":", "$" … app's choice
  atLineStart?: boolean;   // e.g. "/" only at column 0; "@" anywhere
  getCompletions(query: string): Completion[] | Promise<Completion[]>;
  onAccept(completion, ctx): TriggerResult;
}

type TriggerResult =
  | { kind: "text"; value: string }   // splice plain text (e.g. command name)
  | { kind: "chip"; token: Token }    // insert an atomic chip (mention/context)
  | { kind: "dismiss" }               // consume, insert nothing
  | { kind: "command"; name: string; args?: unknown }; // fire an action now
```

The widget watches for a registered trigger char, captures the `query` after it
until a terminator, shows the completion popup, and applies whatever
`TriggerResult` the provider returns. Slash-commands and @-mentions are just two
entries in `triggers[]` — same code path. Apps can add `#tag`, `:emoji`, etc.,
or none.

### 2. Command / keymap registry (keybinding/palette → action)

Buffer-independent actions: a `Ctrl+P` command palette, or direct keybindings
(`Ctrl+L` clear, etc.). Modeled separately because a trigger is "typing into the
buffer with completions" while a command is "invoke an action regardless of
buffer state." They may share the same underlying action list if the app wants.

## Buffer model: rich (runs + atomic tokens) with snapshot undo

The buffer is a sequence of **text runs** and **atomic tokens (chips)**. A plain
string is the trivial subset. Going rich from the start avoids a rewrite to add
chips later. `value` (and `onSubmit`) serialize the buffer to a plain string;
each chip serializes via the app-supplied `serialize(token)` (default = label).

**Undo/redo = buffer snapshots.** Each undo step stores a full copy of the
buffer state. Trivially correct and simple to reason about; memory is irrelevant
at chat-input scale. Coalescing: consecutive plain typing collapses into one
undo step; structural events (auto-pill, paste, chip-delete) are their own
steps. Ctrl+Z / Cmd+Z undo; Ctrl+Shift+Z / Cmd+Shift+Z redo.

## Chips

Visual styles: **`fill`** (subtle tinted background, `$panel`/accent, no border,
single row) and **`bracket`** (subtle Unicode delimiters, e.g. `‹auth.ts›`,
survives copy as plain text). Default `fill`. No borders, no outline primitive —
both styles are single-row and cost no extra rows. (The `outline`/cell-edge
idea was considered and dropped: a true 4-sided box can't be drawn portably in a
terminal cell without spending columns.)

**Atomicity is the contract; visual weight is just a style knob.** Regardless of
style, a chip behaves as one unit:

- **Selection**: any selection touching a chip includes the *whole* chip; it
  counts as a single wide-grapheme at the token boundary so caret math stays
  simple (reuses [`text-selection.ts`](../src/render/text-selection.ts)).
- **Backspace/Delete**: removes the entire chip in one keystroke.
- **Caret skip**: Left/Right jumps the whole chip; the caret never lands inside.
- **Click to copy**: clicking a chip copies its serialized value with a brief
  ack (same pattern as the [copy button](../src/widgets/copy-button.ts)).
- **Auto-pill is undoable**: converting typed text → chip pushes one undo entry,
  so Ctrl+Z reverts chip → raw text for editing.

**Auto-pill timing: on completion-accept only.** Text becomes a chip only when
the user picks an item from the trigger popup (Enter/Tab/click). Typing
`@auth.ts ` with no popup interaction stays plain text — no surprise
conversions.

## Tier-1 behaviors (table stakes)

- **Submit semantics**: Enter sends / Shift+Enter newline (or inverted via
  `submitMode`). `onSubmit` is distinct from `onChange`.
- **Auto-grow**: height grows with content between `minRows` and `maxRows`, then
  scrolls. Critical since the composer shares the screen with a streaming
  transcript.
- **History recall**: edge-aware Up/Down (see below).
- **Busy state**: while `busy`, show "generating… (Esc to interrupt)"; Esc fires
  `onInterrupt()`. Bridges to existing spinner/status widgets.
- **Soft-wrap** rather than horizontal scroll (chat text wraps; another
  code-vs-chat divergence).

## Inline ghost-text autocomplete (app-provided)

Distinct from the trigger popup: triggers show a *list* after a char like `@`;
this is a subtle *continuation* rendered after the caret, accepted in place
(fish/zsh-autosuggestions, Copilot ghost text). Both coexist — popup is
"pick from a set," ghost is "complete what I'm typing."

The app registers a provider; the widget never predicts content:

```ts
setSuggestionProvider(
  (ctx: { value: string; caretOffset: number }) =>
    string | null | Promise<string | null>,  // returns the suffix, or null
);
```

- **Rendering**: the returned suffix is drawn after the caret with `dim` +
  `$dimmed`/`$placeholder` color so it reads as not-yet-typed, prefixed by a
  small dim `→` marker signalling "completion available." It is an **overlay on
  trailing cells, not in the buffer** — caret math and `value` ignore it until
  accepted (the `→` marker is render-only and never enters `value`).
  Async-capable; debounced re-query on keystroke.
- **Accept**: **Right Arrow at end-of-line** when a suggestion is showing
  (default — at EOL, Right is otherwise a no-op, so no conflict). Tab is **not**
  bound by default (it stays focus traversal); it is opt-in via
  `acceptSuggestionKey` and, even when opted in, only accepts *while a
  suggestion is visible*, otherwise falling through to focus nav. Optional
  word-at-a-time accept via Ctrl+→/Alt+→.
- **Dismiss**: caret move, selection change, focus loss, or the typed text
  diverging from the suggestion all clear it.
- **Precedence vs. trigger popup**: while a trigger popup is open it owns
  arrow/Tab/Enter and ghost-text is **suppressed entirely** (no double
  suggestion). Ghost-text only renders, and only owns Right-at-EOL, when no
  popup is visible.

## Send / Stop affordance (in-border, optional)

A state-driven action glyph rendered **into the box's border line at the
bottom-right** (ztui already draws on borders, e.g. box titles), so it costs no
content cells and stays right-aligned as the box resizes.

- **States, one slot**: idle + non-empty buffer → **send** (`⏎`); `busy` →
  **stop** (`■`); idle + empty → hidden/dimmed. Click sends or fires
  `onInterrupt()`.
- **Generic, never dictated**: the glyph is a *visible affordance and mouse
  target only*. Enter always sends and Esc always interrupts regardless of
  whether the glyph is shown or enabled. An app wanting a pure-keyboard composer
  sets `showActionGlyph: false` and loses no behavior. Hover lightens it (same
  pattern as the [copy button](../src/widgets/copy-button.ts)).
- Driven by the same `busy` flag the interrupt affordance uses — no extra state.

## History recall (edge-aware Up/Down)

Up/Down recall from `getHistory()` only at the draft's vertical edges; otherwise
they move the caret within the multiline draft.

- **Default `historyEdge: "bump"`** (editor-style): Up recalls only when the
  caret is at the buffer's true start (Down: its true end), so history never
  fires mid-edit. On the boundary row the first Up just moves the caret to the
  start; a second Up then recalls. Once browsing, Up/Down keep stepping through
  history regardless of caret position (the gate governs only *entering*
  history). Best for composers that are often multiline.
- **`historyEdge: "row"`** (eager, Slack/ChatGPT style): Up recalls whenever the
  caret is on the first row (any column); Down on the last row.
- The **in-progress draft is stashed** on entering history and restored when
  navigating back past the newest entry. Editing a recalled entry forks it —
  history is never mutated.

## What is genuinely new to build

1. **Rich buffer** (runs + atomic tokens) with **snapshot undo/redo**.
2. **Trigger registry** + **command/keymap registry**.
3. **Completion popup** (generic, overlay-anchored, reusable) + **attachment
   strip** (removable chips).
4. **Chips**: `fill | bracket`, atomic selection/delete/caret-skip, click-copy,
   undoable accept-only auto-pill.
5. **Inline ghost-text autocomplete**: app-provided suffix overlay (dim render
   with `→` marker, not in buffer), Right-at-EOL accept (Tab opt-in),
   dismiss-on-move, suppressed while a popup is open.
6. **Send/Stop in-border glyph**: `busy`-driven, bottom-right on the border,
   optional (`showActionGlyph`), keyboard-independent.
7. **`ChatInputWidget`** orchestrating submit / auto-grow / edge-aware history /
   busy / soft-wrap and hosting the popup + strip + ghost overlay + action glyph.

Reused as-is: grapheme/width helpers ([`segment.ts`](../src/render/segment.ts)),
selection ordering ([`text-selection.ts`](../src/render/text-selection.ts)),
caret blink ([`caret.ts`](../src/widgets/controls/internal/caret.ts)),
clipboard, overlay positioning, theme tokens. We build a **fresh core** (the
rich buffer + soft-wrap diverge too far from the textarea's line-array model)
that shares this plumbing rather than subclassing `TextAreaWidget`.

## Suggested milestones

1. Rich buffer + snapshot undo + plain typing/selection/caret/soft-wrap +
   submit semantics + auto-grow + edge-aware history + busy. (A usable composer,
   no triggers/chips yet.)
2. Chips (fill/bracket) + atomic behaviors + click-copy.
3. Trigger registry + completion popup; wire slash & mention as example
   triggers in a demo.
4. Inline ghost-text autocomplete (suggestion provider + overlay + accept key)
   + in-border send/stop glyph.
5. Command/keymap registry + palette.
6. Attachment strip + paste intelligence (collapse huge paste → chip; image
   paste → attachment).
7. React `<ChatInput>` adapter + `chat_demo.tsx` (streaming markdown transcript
   above a live composer).
