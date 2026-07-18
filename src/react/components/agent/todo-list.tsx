import type { ReactElement, ReactNode } from "react";
import { HBox } from "../layout/hbox.tsx";
import { VBox } from "../layout/vbox.tsx";
import { Label } from "../text/label.tsx";
import type { ComponentProps } from "../types.ts";

/** Lifecycle of one task. */
export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

/** A single task in a {@link TodoList}. */
export interface TodoItem {
  /** The task description. */
  text: string;
  /** Lifecycle state. Defaults to `"pending"`. */
  status?: TodoStatus;
}

/** Glyph + colour + text styling per status. */
const STATUS_STYLE: Record<
  TodoStatus,
  { glyph: string; color: string; strike?: boolean; bold?: boolean; dim?: boolean }
> = {
  pending: { glyph: "○", color: "$dimmed" },
  in_progress: { glyph: "◐", color: "$accent", bold: true },
  // "✓" (U+2713), not the emoji-codepoint "✔" (U+2714) — see status.ts's
  // completed-glyph comment for why.
  completed: { glyph: "✓", color: "$success", strike: true, dim: true },
  cancelled: { glyph: "✗", color: "$error", strike: true, dim: true },
};

export interface TodoListProps extends ComponentProps {
  /** The tasks, in order. */
  items: TodoItem[];
  /**
   * Optional heading. A trailing `done/total` count is appended (e.g.
   * `"Plan  2/5"`). Omit to render just the list.
   */
  title?: string;
  /** Trailing icon node beside the title. */
  icon?: ReactNode;
}

/**
 * An agent task checklist: one row per task with a status glyph (`○` pending,
 * `◐` in-progress, `✓` done, `✗` cancelled), the in-progress task emphasised and
 * finished ones struck through. Pass `title` for a heading with a live progress
 * count. A compact, read-only mirror of the agent's plan — re-render it with new
 * `items` as work advances.
 *
 * ```tsx
 * <TodoList title="Plan" items={[
 *   { text: "Read the spec", status: "completed" },
 *   { text: "Implement", status: "in_progress" },
 *   { text: "Write tests" },
 * ]} />
 * ```
 */
export function TodoList({ items, title, icon, ...rest }: TodoListProps): ReactElement {
  const done = items.filter((i) => i.status === "completed").length;
  const hasIcon = icon != null && icon !== false;

  return (
    <VBox {...rest} style={{ width: "100%", ...rest.style }}>
      {title ? (
        <HBox style={{ width: "100%", height: 1 }}>
          {hasIcon ? <Label style={{ padding: { right: 1 } }}>{icon}</Label> : undefined}
          <Label style={{ bold: true }}>{title}</Label>
          <Label style={{ color: "$dimmed", padding: { left: 1 } }}>
            {done}/{items.length}
          </Label>
        </HBox>
      ) : undefined}
      {items.map((item, i) => {
        const s = STATUS_STYLE[item.status ?? "pending"];
        return (
          <HBox
            // biome-ignore lint/suspicious/noArrayIndexKey: ordered task list, index is stable
            key={i}
            style={{ width: "100%", height: 1 }}
          >
            <Label style={{ color: s.color, width: 2 }}>{s.glyph}</Label>
            <Label
              style={{
                color: s.dim ? "$dimmed" : "$foreground",
                bold: s.bold,
                strikethrough: s.strike,
              }}
            >
              {item.text}
            </Label>
          </HBox>
        );
      })}
    </VBox>
  );
}
TodoList.displayName = "TodoList";
