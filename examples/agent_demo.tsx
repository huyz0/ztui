import { Fragment, useEffect, useRef, useState } from "react";
import type { Widget } from "../src/core.ts";
import {
  ChatBubble,
  type Completion,
  Conversation,
  Dock,
  FileChip,
  HBox,
  Label,
  Markdown,
  type ModelEntry,
  ModelPicker,
  Pill,
  Popover,
  Reasoning,
  StreamingText,
  TaskTree,
  type ToolCallStatus,
  ToolRender,
  type Trigger,
  UsageMeter,
} from "../src/react.ts";
import type { Demo } from "./gallery/types.ts";

// A miniature terminal coding agent built entirely from the Agent Kit: the whole
// screen is one <Conversation> (tail-following transcript + docked composer with
// its hint line). The transcript mixes ChatBubble / Reasoning / TaskTree /
// ToolRender / StreamingText / FileChip; the composer carries `@` file mentions
// and a `/model` command that opens the ModelPicker in a popover; the current
// model shows as a clickable badge in the hint row's trailing slot, and a live
// UsageMeter sits in the footer.

const MODELS: ModelEntry[] = [
  {
    id: "opus",
    provider: "Anthropic",
    name: "Claude Opus 4.8",
    cost: 2,
    reasoning: true,
    location: "remote",
  },
  {
    id: "sonnet",
    provider: "Anthropic",
    name: "Claude Sonnet 4.6",
    cost: 1,
    reasoning: true,
    location: "remote",
  },
  { id: "haiku", provider: "Anthropic", name: "Claude Haiku 4.5", cost: 1, location: "remote" },
  {
    id: "qwen",
    provider: "Ollama",
    name: "Qwen2.5 Coder",
    cost: 1,
    reasoning: true,
    location: "local",
  },
];

const FILES = ["app.ts", "retry.ts", "server.ts", "README.md"];

interface Turn {
  id: number;
  node: React.ReactNode;
}

function AgentDemoApp() {
  const [model, setModel] = useState<ModelEntry>(MODELS[0]);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<ToolCallStatus>("running");
  const [used, setUsed] = useState(18_400);
  const nextId = useRef(2);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const badgeRef = useRef<Widget>(null);

  // The opening turn cycles its Bash tool pending → success so the transcript
  // feels alive on load.
  useEffect(() => {
    const a = setTimeout(() => setLive("success"), 1600);
    return () => clearTimeout(a);
  }, []);

  const [turns, setTurns] = useState<Turn[]>([
    {
      id: 0,
      node: (
        <ChatBubble role="user">
          Add jitter to the retry helper in @retry.ts and run the tests.
        </ChatBubble>
      ),
    },
    { id: 1, node: null }, // the live assistant turn, rendered from state below
  ]);

  const mention: Trigger = {
    char: "@",
    getCompletions: (q) =>
      FILES.filter((f) => f.includes(q.toLowerCase())).map(
        (f): Completion => ({ label: f, detail: "file" }),
      ),
    onAccept: (c) => ({ kind: "chip", token: { label: c.label, kind: "file", payload: c.label } }),
  };

  const reply = (prompt: string) => {
    setBusy(true);
    const id = nextId.current++;
    timer.current = setTimeout(() => {
      setTurns((t) => [
        ...t,
        {
          id,
          node: (
            <ChatBubble role="assistant">
              <StreamingText>{`Done — "${prompt.trim()}". Anything else?`}</StreamingText>
            </ChatBubble>
          ),
        },
      ]);
      setUsed((u) => u + 1_900);
      setBusy(false);
    }, 1400);
  };

  return (
    <Dock style={{ background: "$background" }}>
      <Conversation
        busy={busy}
        placeholder="Message the agent…   (/model to switch · @ to mention a file)"
        composer={{
          triggers: [mention],
          commands: [{ name: "model", label: "Switch model", run: () => setPicker(true) }],
          onCommand: (name) => {
            if (name === "model") setPicker(true);
          },
        }}
        footer={
          <UsageMeter
            variant="compact"
            turn={{ input: 1234, output: 340, cacheRead: 980, cacheWrite: 120 }}
            session={{ input: 64_000, output: 18_000, cacheRead: 51_000 }}
            contextSize={200_000}
            contextUsed={used}
            cost={0.21}
          />
        }
        hintTrailing={
          // Clicking the badge (or running /model) opens the picker.
          <HBox ref={badgeRef} onClick={() => setPicker(true)}>
            <Pill color={model.location === "local" ? "$success" : "$accent"}>{model.name}</Pill>
          </HBox>
        }
        onSubmit={(value) => {
          if (!value.trim()) return;
          setTurns((t) => [
            ...t,
            { id: nextId.current++, node: <ChatBubble role="user">{value}</ChatBubble> },
          ]);
          reply(value);
        }}
        onInterrupt={() => {
          if (timer.current) clearTimeout(timer.current);
          setBusy(false);
        }}
      >
        {turns.map((turn) =>
          turn.id === 1 ? (
            <ChatBubble key="live" role="assistant">
              <TaskTree
                title="Plan"
                items={[
                  {
                    text: "Add ±25% jitter to retry.ts",
                    status: live === "success" ? "completed" : "in_progress",
                    children: [
                      { text: "compute backoff", status: "completed" },
                      {
                        text: "apply jitter",
                        status: live === "success" ? "completed" : "in_progress",
                      },
                    ],
                  },
                  {
                    text: "Run the test suite",
                    status: live === "success" ? "completed" : "pending",
                  },
                ]}
              />
              <Reasoning
                active={live !== "success"}
                duration={live === "success" ? "thought for 1s" : undefined}
                collapseWhenDone
              >
                <Markdown trimTrailingMargin>
                  Jitter avoids the thundering-herd: multiply each delay by a random factor in
                  `[0.75, 1.25]` before sleeping.
                </Markdown>
              </Reasoning>
              <ToolRender
                defaultOpen
                call={{
                  name: "Bash",
                  args: "npm test",
                  status: live,
                  data: {
                    command: "npm test",
                    output:
                      live === "success" ? ["PASS  retry.test.ts", "42 passed (42)"] : ["running…"],
                    exitCode: live === "success" ? 0 : undefined,
                  },
                }}
              />
              <HBox style={{ height: 1 }}>
                <Label style={{ color: "$dimmed", padding: { right: 1 } }}>edited</Label>
                <FileChip path="src/core/retry.ts" line={37} onOpen={() => {}} />
              </HBox>
              <StreamingText streaming={live !== "success"}>
                {live === "success" ? "Added jitter and the suite is green." : "Patching retry.ts…"}
              </StreamingText>
            </ChatBubble>
          ) : (
            <Fragment key={turn.id}>{turn.node}</Fragment>
          ),
        )}
      </Conversation>

      {/* The model picker, anchored under the model badge. */}
      <Popover open={picker} anchorRef={badgeRef} onClose={() => setPicker(false)}>
        <ModelPicker
          models={MODELS}
          value={model.id}
          onSelect={(m) => {
            setModel(m);
            setPicker(false);
          }}
          style={{ width: 52, height: 9, background: "$panel", border: "rounded", padding: 1 }}
        />
      </Popover>
    </Dock>
  );
}

export const agentDemo: Demo = {
  id: "agent",
  title: "Agent",
  group: "Text",
  description:
    "A mini coding agent: Conversation transcript (reasoning, tasks, tool calls), a /model picker popover, and a live usage meter.",
  Component: AgentDemoApp,
};
