import type { ReactElement, ReactNode } from "react";
import { HBox } from "../layout/hbox.tsx";
import { VBox } from "../layout/vbox.tsx";
import { Label } from "../text/label.tsx";
import type { ComponentProps } from "../types.ts";
import type { TodoStatus } from "./todo-list.tsx";

/** Glyph + colour + text styling per status (shared shape with `TodoList`). */
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

/** A node in a {@link TaskTree} — a task that may own sub-tasks. */
export interface TaskNode {
  /** The task description. */
  text: string;
  /** Lifecycle state. Defaults to `"pending"`. */
  status?: TodoStatus;
  /** Nested sub-tasks, rendered indented beneath this one. */
  children?: TaskNode[];
}

export interface TaskTreeProps extends ComponentProps {
  /** The root tasks, in order. */
  items: TaskNode[];
  /**
   * Optional heading. A trailing `done/total` count over every node in the tree
   * is appended (e.g. `"Plan  3/8"`). Omit to render just the tree.
   */
  title?: string;
  /** Trailing icon node beside the title. */
  icon?: ReactNode;
}

/** Count `[done, total]` across every node in the forest. */
function tally(nodes: TaskNode[]): [number, number] {
  let done = 0;
  let total = 0;
  for (const n of nodes) {
    total += 1;
    if (n.status === "completed") done += 1;
    if (n.children?.length) {
      const [d, t] = tally(n.children);
      done += d;
      total += t;
    }
  }
  return [done, total];
}

/**
 * A hierarchical agent task tree: like {@link TodoList} but for nested plans.
 * Each node carries a status glyph (`○` pending, `◐` in-progress, `✓` done, `✗`
 * cancelled) with the in-progress task emphasised and finished ones struck
 * through, and sub-tasks are drawn indented under dimmed `├─`/`└─` connectors.
 * Pass `title` for a heading with a live progress count over the whole tree.
 * Read-only — re-render it with new `items` as work advances.
 *
 * ```tsx
 * <TaskTree title="Plan" items={[
 *   { text: "Build feature", status: "in_progress", children: [
 *     { text: "Read the spec", status: "completed" },
 *     { text: "Implement", status: "in_progress" },
 *   ] },
 *   { text: "Ship it" },
 * ]} />
 * ```
 */
export function TaskTree({ items, title, icon, ...rest }: TaskTreeProps): ReactElement {
  const [done, total] = tally(items);
  const hasIcon = icon != null && icon !== false;
  const rows: ReactElement[] = [];

  // Flatten the forest into rows, building each node's connector prefix from
  // its ancestors: a column shows `│` when that ancestor has a later sibling,
  // blank when it was the last — so the branch lines join up correctly.
  const walk = (nodes: TaskNode[], ancestorHasNext: boolean[], path: string): void => {
    nodes.forEach((node, i) => {
      const isLast = i === nodes.length - 1;
      const prefix =
        ancestorHasNext.map((hasNext) => (hasNext ? "│  " : "   ")).join("") +
        (isLast ? "└─ " : "├─ ");
      const s = STATUS_STYLE[node.status ?? "pending"];
      const key = `${path}/${i}`;
      rows.push(
        <HBox key={key} style={{ width: "100%", height: 1 }}>
          <Label style={{ color: "$dimmed" }}>{prefix}</Label>
          <Label style={{ color: s.color, width: 2 }}>{s.glyph}</Label>
          <Label
            style={{
              color: s.dim ? "$dimmed" : "$foreground",
              bold: s.bold,
              strikethrough: s.strike,
            }}
          >
            {node.text}
          </Label>
        </HBox>,
      );
      if (node.children?.length) walk(node.children, [...ancestorHasNext, !isLast], key);
    });
  };
  walk(items, [], "root");

  return (
    <VBox {...rest} style={{ width: "100%", ...rest.style }}>
      {title ? (
        <HBox style={{ width: "100%", height: 1 }}>
          {hasIcon ? <Label style={{ padding: { right: 1 } }}>{icon}</Label> : undefined}
          <Label style={{ bold: true }}>{title}</Label>
          <Label style={{ color: "$dimmed", padding: { left: 1 } }}>
            {done}/{total}
          </Label>
        </HBox>
      ) : undefined}
      {rows}
    </VBox>
  );
}
TaskTree.displayName = "TaskTree";
