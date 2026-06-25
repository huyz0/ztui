import { useEffect, useState } from "react";
import {
  ApprovalPrompt,
  ChatBubble,
  Dock,
  FileChip,
  HBox,
  Header,
  Label,
  Markdown,
  Reasoning,
  StreamingText,
  TaskTree,
  type ToolCallStatus,
  ToolRender,
  Transcript,
  UsageMeter,
  VBox,
} from "../src/react.ts";
import { ExitButton } from "./exit-button.tsx";
import type { Demo } from "./gallery/types.ts";

// An agent transcript built from the Agent Kit primitives. Each turn is a
// ChatBubble whose accent bar says who's speaking (orange right = you, blue
// left = assistant, silver left = tool). Messages pack tight — the bars and bold
// authors separate turns, so no blank rows are spent between them. The tool
// turn's Bash run cycles pending → running → success; a batch approval gate for
// three tool calls closes the transcript.
function ToolCallDemoApp() {
  const [live, setLive] = useState<ToolCallStatus>("pending");
  const [rule, setRule] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    const a = setTimeout(() => setLive("running"), 900);
    const b = setTimeout(() => setLive("success"), 2200);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);

  return (
    <Dock style={{ background: "$background" }}>
      <Header>🛠️ ZTUI Agent · Transcript</Header>
      <VBox style={{ padding: 1, height: "1fr" }}>
        {/* Transcript tails: it stays pinned to the newest turn as the agent
            streams, until you scroll up to read back. */}
        <Transcript style={{ height: "1fr" }}>
          <ChatBubble role="user">
            <Markdown trimTrailingMargin>Run the **tests** and clean the `build` dir.</Markdown>
          </ChatBubble>

          <ChatBubble role="assistant">
            <TaskTree
              title="Plan"
              items={[
                {
                  text: "Run the test suite",
                  status: live === "success" ? "completed" : "in_progress",
                  children: [
                    {
                      text: "unit tests",
                      status: live === "success" ? "completed" : "in_progress",
                    },
                    { text: "e2e tests", status: live === "success" ? "completed" : "pending" },
                  ],
                },
                { text: "Clean the build dir (needs approval)", status: "pending" },
              ]}
            />
            <Reasoning
              active={live !== "success"}
              duration={live === "success" ? "thought for 2s" : undefined}
              collapseWhenDone
            >
              <Markdown trimTrailingMargin>
                The user wants tests run, then the build dir cleaned. Cleaning is destructive, so
                I'll run tests first and gate the `rm` on approval.
              </Markdown>
            </Reasoning>
            <StreamingText streaming={live !== "success"}>
              On it — running the suite, then I'll ask before removing anything.
            </StreamingText>
            <HBox style={{ height: 1 }}>
              <Label style={{ color: "$dimmed", padding: { right: 1 } }}>edited</Label>
              <FileChip path="src/core/app.ts" line={461} onOpen={() => {}} />
            </HBox>
          </ChatBubble>

          <ChatBubble role="tool">
            {/* ToolRender picks a built-in renderer by tool name: Bash →
              syntax-highlighted command + streaming output; Edit → a diff. */}
            <ToolRender
              defaultOpen
              call={{
                name: "Bash",
                args: "npm test",
                status: live,
                data: {
                  command: "npm test",
                  output:
                    live === "success"
                      ? ["PASS  src/app.test.ts", "1201 passed (1201)"]
                      : ["running…"],
                  exitCode: live === "success" ? 0 : undefined,
                },
              }}
            />
            <ToolRender
              call={{
                name: "Edit",
                args: "src/core/app.ts",
                status: "success",
                data: {
                  language: "ts",
                  oldText: "let full = doLayout;",
                  newText: "let full = doLayout || forced;",
                },
              }}
            />
          </ChatBubble>
        </Transcript>

        <VBox style={{ height: 1 }} />

        {/* Single command: the host builds command-derived options (exact / all
            ls), plus a "custom pattern…" field the user types into. */}
        {rule == null ? (
          <ApprovalPrompt
            prompt="Allow `ls some/folder`?"
            actions={[
              { id: "allow", label: "Allow", icon: "✓", key: "a", tone: "success" },
              { id: "deny", label: "Deny", icon: "✗", key: "d", tone: "danger" },
              {
                id: "always",
                label: "Always",
                icon: "⧉",
                key: "s",
                tone: "primary",
                menu: [
                  { id: "exact", label: "this exact command", icon: "✓" },
                  { id: "all-ls", label: "all `ls` commands", icon: "✓" },
                  {
                    id: "custom",
                    label: "custom pattern…",
                    icon: "≈",
                    input: { placeholder: "e.g. ls some/*" },
                  },
                ],
              },
            ]}
            onAction={(id, value) => setRule(value ? `${id}: ${value}` : id)}
          >
            <Label style={{ color: "$dimmed" }}>$ ls some/folder</Label>
          </ApprovalPrompt>
        ) : (
          <ChatBubble role="tool">
            <Label style={{ color: "$success" }}>Rule → {rule}</Label>
          </ChatBubble>
        )}

        <VBox style={{ height: 1 }} />

        {outcome == null ? (
          <ApprovalPrompt
            prompt="Claude wants to run 4 shell commands:"
            // `matches` lets "Allow matching ▾" offer per-command grants — all
            // `cd`, all `ls`, a glob, or the "read-only" group — not just "all
            // Bash". The host derives these (here: tool, command head, a group).
            calls={[
              { id: "1", name: "Bash", args: "cd src", matches: ["Bash", "cd", "read-only"] },
              { id: "2", name: "Bash", args: "ls -la", matches: ["Bash", "ls", "read-only"] },
              {
                id: "3",
                name: "Bash",
                args: "cat README.md",
                matches: ["Bash", "cat", "read-only"],
              },
              {
                id: "4",
                name: "Bash",
                args: "rm -rf build",
                defaultDecision: "deny",
                matches: ["Bash", "rm", "rm -rf *"],
              },
            ]}
            onMatch={() => {
              /* host would persist a standing rule, e.g. "always allow cat" */
            }}
            onResolve={(d) =>
              setOutcome(
                Object.entries(d)
                  .map(([id, v]) => `${id}:${v}`)
                  .join("  "),
              )
            }
          />
        ) : (
          <ChatBubble role="tool">
            <Label style={{ color: "$success" }}>Resolved → {outcome}</Label>
          </ChatBubble>
        )}

        <VBox style={{ height: 1 }} />
        <UsageMeter
          variant="compact"
          turn={{ input: 1234, output: 340, cacheRead: 840, cacheWrite: 120 }}
          session={{ input: 45000, output: 12000, cacheRead: 32000 }}
          contextSize={200000}
          contextUsed={156000}
          cost={0.12}
        />
        <ExitButton style={{ margin: 0 }}>Exit</ExitButton>
      </VBox>
    </Dock>
  );
}

export const toolCallDemo: Demo = {
  id: "tool-call",
  title: "Agent Transcript",
  group: "Text",
  description:
    "Agent Kit: role-accented chat bubbles, tool-call cards with icons, and a batch approval gate.",
  Component: ToolCallDemoApp,
};
