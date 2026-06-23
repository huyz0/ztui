import type { ReactElement, ReactNode } from "react";
import { Diff } from "../data/diff.tsx";
import { RichLog } from "../data/rich-log.tsx";
import { VBox } from "../layout/vbox.tsx";
import { Markdown } from "../text/markdown.tsx";
import { Syntax } from "../text/syntax.tsx";
import type { MessageAccent } from "./roles.ts";
import { ToolCall, type ToolCallStatus } from "./tool-call.tsx";

/**
 * Everything a {@link ToolRenderer} needs to render one tool invocation. `data`
 * is the tool-specific payload the host attaches — a renderer registered for a
 * given tool knows its shape and casts accordingly.
 */
export interface ToolRenderContext {
  /** Tool name, used to pick the renderer. */
  name: string;
  /** Raw argument string (the command, the file path, …) shown in the header. */
  args?: string;
  /** Execution status. */
  status?: ToolCallStatus;
  /** Tool-specific payload (command + output, a diff, file content, …). */
  data?: any;
}

/**
 * How to render a particular tool's request and result. Every field is optional
 * — supply only what your tool needs. The header (name + args) comes from the
 * {@link ToolCall} card; a renderer fills the icon, collapsed summary, and the
 * expandable body.
 */
export interface ToolRenderer {
  /** Leading icon for the card header. */
  icon?: ReactNode;
  /** Optional one-sided accent bar around the card. */
  accent?: Partial<MessageAccent>;
  /** One-line collapsed summary (e.g. `"exit 0"`, `"+42 −3"`). */
  summary?: (ctx: ToolRenderContext) => string | undefined;
  /** The expandable result body. */
  renderBody?: (ctx: ToolRenderContext) => ReactNode;
}

/**
 * Bash / shell: syntax-highlight the command, and stream its output through a
 * {@link RichLog} (append-only, tails the latest lines). `data`:
 * `{ command?: string; output?: string[]; exitCode?: number }`.
 */
export const bashToolRenderer: ToolRenderer = {
  icon: "🖥️",
  summary: (c) => (c.data?.exitCode != null ? `exit ${c.data.exitCode}` : undefined),
  renderBody: (c) => {
    const command = c.data?.command ?? c.args ?? "";
    const output: string[] = c.data?.output ?? [];
    return (
      <VBox style={{ width: "100%" }}>
        <Syntax language="bash">{command}</Syntax>
        {output.length > 0 ? (
          <RichLog lines={output} style={{ height: Math.min(output.length, 12), width: "100%" }} />
        ) : undefined}
      </VBox>
    );
  },
};

/**
 * A file edit: the unified/split {@link Diff} of before → after. `data`:
 * `{ language?: string; oldText: string; newText: string }`.
 */
export const diffToolRenderer: ToolRenderer = {
  icon: "✎",
  summary: (c) => (c.data ? "diff" : undefined),
  renderBody: (c) =>
    c.data ? (
      <Diff
        language={c.data.language}
        oldText={c.data.oldText ?? ""}
        newText={c.data.newText ?? ""}
      />
    ) : undefined,
};

/**
 * Writing/creating a file: syntax-highlight the new content. `data`:
 * `{ language?: string; content: string; path?: string }`.
 */
export const writeToolRenderer: ToolRenderer = {
  icon: "📄",
  summary: (c) => c.data?.path,
  renderBody: (c) => <Syntax language={c.data?.language}>{c.data?.content ?? ""}</Syntax>,
};

/** Fallback: render `data` (a string, or `{ text }`) as Markdown. */
export const textToolRenderer: ToolRenderer = {
  renderBody: (c) => {
    const text = typeof c.data === "string" ? c.data : c.data?.text;
    return text ? <Markdown trimTrailingMargin>{text}</Markdown> : undefined;
  },
};

/**
 * Sensible built-in renderers keyed by common tool names. Spread-and-override to
 * register your own: `{ ...DEFAULT_TOOL_RENDERERS, MyTool: myRenderer }`.
 */
export const DEFAULT_TOOL_RENDERERS: Record<string, ToolRenderer> = {
  Bash: bashToolRenderer,
  Shell: bashToolRenderer,
  PowerShell: bashToolRenderer,
  Edit: diffToolRenderer,
  Write: writeToolRenderer,
  Create: writeToolRenderer,
};

export interface ToolRenderProps {
  /** The tool invocation to render. */
  call: ToolRenderContext;
  /** Name → renderer map. Defaults to {@link DEFAULT_TOOL_RENDERERS}. */
  renderers?: Record<string, ToolRenderer>;
  /** Used when no renderer matches `call.name`. Defaults to {@link textToolRenderer}. */
  fallback?: ToolRenderer;
  /** Initial expanded state of the card. */
  defaultOpen?: boolean;
}

/**
 * Render a tool invocation as a {@link ToolCall} card, choosing the body from a
 * renderer registry by tool name. The framework is generic: hosts register a
 * {@link ToolRenderer} per tool to render its request and result however they
 * like, and ztui ships built-ins ({@link bashToolRenderer},
 * {@link diffToolRenderer}, {@link writeToolRenderer}) that compose `Syntax`,
 * `Diff`, and a streaming `RichLog`.
 *
 * ```tsx
 * <ToolRender call={{ name: "Bash", args: "npm test",
 *   data: { command: "npm test", output: lines, exitCode: 0 } }} />
 * ```
 */
export function ToolRender({
  call,
  renderers = DEFAULT_TOOL_RENDERERS,
  fallback = textToolRenderer,
  defaultOpen,
}: ToolRenderProps): ReactElement {
  const r = renderers[call.name] ?? fallback;
  return (
    <ToolCall
      name={call.name}
      icon={r.icon}
      args={call.args}
      status={call.status}
      summary={r.summary?.(call)}
      accent={r.accent}
      defaultOpen={defaultOpen}
    >
      {r.renderBody?.(call)}
    </ToolCall>
  );
}
ToolRender.displayName = "ToolRender";
