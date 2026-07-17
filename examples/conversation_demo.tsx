import { useRef, useState } from "react";
import {
  ChatBubble,
  type Completion,
  Conversation,
  Dock,
  Header,
  Reasoning,
  type Trigger,
  UsageMeter,
} from "../src/react.ts";
import type { Demo } from "./gallery/types.ts";

// The whole agent chat in one component: `Conversation` lays out a
// tail-following transcript of `ChatBubble` turns above a docked `ChatInput`,
// and wires submit / interrupt / busy / the contextual hint line for you. The
// app only owns the turn list and the busy flag — no manual hint state, spacer
// rows, or scroll plumbing. The footer carries a live `UsageMeter`.

interface Turn {
  id: number;
  role: "user" | "assistant";
  text: string;
  thinking?: boolean;
}

const FILES = ["auth.ts", "main.rs", "README.md", "server.py", "utils.ts"];
const COMMANDS = ["clear", "model", "retry"];

function ConversationDemoApp() {
  const [turns, setTurns] = useState<Turn[]>([
    {
      id: 0,
      role: "assistant",
      text: "Hi! Ask me anything — try `@` to mention a file or `/` for a command.",
    },
    { id: 1, role: "user", text: "What does the retry helper in @utils.ts do?" },
    {
      id: 2,
      role: "assistant",
      text: "It wraps a call in exponential backoff: up to 5 attempts, doubling the delay each time (100ms → 1.6s) and giving up on non-retryable errors.",
    },
    { id: 3, role: "user", text: "Add jitter so retries don't thundering-herd." },
    {
      id: 4,
      role: "assistant",
      text: "Good call — I'll add ±25% random jitter to each delay. Want me to apply it now?",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [used, setUsed] = useState(8_200);
  const nextId = useRef(5);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mention: Trigger = {
    char: "@",
    getCompletions: (q) =>
      FILES.filter((f) => f.includes(q.toLowerCase())).map(
        (f): Completion => ({
          label: f,
          detail: "file",
        }),
      ),
    onAccept: (c) => ({ kind: "chip", token: { label: c.label, kind: "file", payload: c.label } }),
  };
  const slash: Trigger = {
    char: "/",
    atLineStart: true,
    getCompletions: (q) =>
      COMMANDS.filter((c) => c.startsWith(q)).map((c): Completion => ({ label: c })),
    onAccept: (c) => ({ kind: "command", name: c.label }),
  };

  const reply = (prompt: string) => {
    setBusy(true);
    const id = nextId.current++;
    setTurns((t) => [...t, { id, role: "assistant", text: "", thinking: true }]);
    timer.current = setTimeout(() => {
      setTurns((t) =>
        t.map((turn) =>
          turn.id === id
            ? { ...turn, thinking: false, text: `You said: "${prompt.trim()}" — on it.` }
            : turn,
        ),
      );
      setUsed((u) => u + 1_400);
      setBusy(false);
    }, 1500);
  };

  return (
    <Dock style={{ background: "$background" }}>
      <Conversation
        header={<Header>💬 ZTUI Conversation</Header>}
        busy={busy}
        placeholder="Message the agent…"
        composer={{
          triggers: [mention, slash],
          acceptSuggestionKey: "tab",
          onCommand: (name) => {
            if (name === "clear") setTurns([]);
          },
        }}
        footer={
          <UsageMeter
            variant="compact"
            turn={{ input: 1234, output: 340, cacheRead: 840 }}
            contextSize={200_000}
            contextUsed={used}
          />
        }
        onSubmit={(value) => {
          if (!value.trim()) return;
          setTurns((t) => [...t, { id: nextId.current++, role: "user", text: value }]);
          reply(value);
        }}
        onInterrupt={() => {
          if (timer.current) clearTimeout(timer.current);
          setBusy(false);
          setTurns((t) =>
            t.map((x) => (x.thinking ? { ...x, thinking: false, text: "(interrupted)" } : x)),
          );
        }}
      >
        {turns.map((turn) =>
          turn.thinking ? (
            <ChatBubble key={turn.id} role="assistant" align="left">
              <Reasoning active label="Thinking through your request" />
            </ChatBubble>
          ) : (
            <ChatBubble
              key={turn.id}
              role={turn.role}
              align={turn.role === "user" ? "right" : "left"}
            >
              {turn.text}
            </ChatBubble>
          ),
        )}
      </Conversation>
    </Dock>
  );
}

export const conversationDemo: Demo = {
  id: "conversation",
  title: "Conversation",
  group: "Text",
  description:
    "Agent chat shell: a tail-following transcript of left/right-aligned bubbles with a docked composer, busy/interrupt and hint-line wired in.",
  Component: ConversationDemoApp,
};
