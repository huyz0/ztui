import type { ChipSerializer } from "../../../widgets/controls/chat/model.ts";
import type { Attachment, Command, Trigger } from "../../../widgets/controls/chat/types.ts";
import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

/** Props for {@link ChatInput} — a chat composer for AI-agent UIs. */
export interface ChatInputProps extends ComponentProps {
  /** Current text (controlled; setting it does not re-emit `onChange`). */
  value?: string;
  /** Hint shown when empty. */
  placeholder?: string;
  /** True while the agent is generating — shows the in-border stop affordance. */
  busy?: boolean;
  /** Enter sends ("enter", default) or Mod+Enter sends ("modifier-enter"). */
  submitMode?: "enter" | "modifier-enter";
  /** Minimum visible rows. */
  minRows?: number;
  /** Maximum visible rows before the content scrolls. */
  maxRows?: number;
  /** Wrap long lines (default true). */
  softWrap?: boolean;
  /** Chip rendering style. */
  chipStyle?: "fill" | "bracket";
  /** Show the in-border send/stop glyph (default true; keyboard always works). */
  showActionGlyph?: boolean;
  /** Ghost-text accept key (default "right"). */
  acceptSuggestionKey?: "right" | "tab" | "ctrl-e";
  /** When Up/Down recall history vs. move the caret. */
  historyEdge?: "row" | "bump";
  /** Character-triggered completion sources (slash, mention, …). */
  triggers?: Trigger[];
  /** Keybinding/palette commands. */
  commands?: Command[];
  /** App-provided inline ghost-text autocomplete. */
  suggestionProvider?: (ctx: {
    value: string;
    caretOffset: number;
  }) => string | null | Promise<string | null>;
  /** App-provided history, pulled lazily for Up/Down recall. */
  getHistory?: () => string[];
  /** How a chip serializes into the submitted string. */
  serialize?: ChipSerializer;
  /** Called on every edit with the new value. */
  onChange?: (value: string) => void;
  /** Called when the user sends a turn. */
  onSubmit?: (value: string, attachments: Attachment[]) => void;
  /** Called when the user interrupts a busy agent (Esc / stop glyph). */
  onInterrupt?: () => void;
  /** Called when a trigger/command resolves to an action. */
  onCommand?: (name: string, args?: unknown) => void;
}

/**
 * A feature-rich chat composer: auto-grow, send-on-Enter, atomic chips,
 * character-triggered completions, ghost-text autocomplete, history recall, and
 * an in-border send/stop affordance. The widget owns its draft buffer, so it
 * works with any state-management approach.
 */
export const ChatInput = hostComponent<ChatInputProps>("ztui-chat-input");
