import { useRef, useState } from "react";
import {
  type ChatHint,
  ChatInput,
  type Completion,
  Dock,
  Footer,
  Header,
  Label,
  type Trigger,
  VBox,
  View,
} from "../src/react.ts";
import { ExitButton, quitHint } from "./exit-button.tsx";

interface Turn {
  role: "you" | "agent";
  text: string;
}

// A pretend file index for @-mention completions.
const FILES = ["auth.ts", "main.rs", "README.md", "server.py", "utils.ts", "config.json"];
// Slash commands.
const COMMANDS = ["clear", "model", "help", "retry"];
// Canned ghost-text continuations, keyed by a prefix the user might type.
const GHOSTS: Record<string, string> = {
  "how do i ": "run the tests?",
  "explain ": "this function to me",
  "refactor ": "this to be more readable",
};

function ChatDemoApp() {
  const [turns, setTurns] = useState<Turn[]>([
    { role: "agent", text: "Hi! Try @ to mention a file, / for a command, or just type." },
  ]);
  const [busy, setBusy] = useState(false);
  const [hints, setHints] = useState<ChatHint[]>([]);
  const history = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mention: Trigger = {
    char: "@",
    getCompletions: (q) =>
      FILES.filter((f) => f.toLowerCase().includes(q.toLowerCase())).map(
        (f): Completion => ({ label: f, detail: "file" }),
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

  const fakeReply = (prompt: string) => {
    setBusy(true);
    timer.current = setTimeout(() => {
      setTurns((t) => [...t, { role: "agent", text: `You said: "${prompt.trim()}" — got it.` }]);
      setBusy(false);
    }, 1400);
  };

  return (
    <Dock style={{ background: "$background" }}>
      <Header>💬 ZTUI Chat Composer</Header>
      <Footer>
        {hints.map((h) => `${h.keys} ${h.label}`).join("  │  ")}
        {quitHint("  │  ")}
      </Footer>

      <VBox style={{ padding: 1, height: "1fr" }}>
        {/* Transcript */}
        <VBox style={{ height: "1fr", border: "rounded", padding: 1, background: "$surface" }}>
          {turns.map((turn, i) => (
            <Label
              // biome-ignore lint/suspicious/noArrayIndexKey: static demo transcript
              key={i}
              style={{ color: turn.role === "you" ? "$accent" : "$foreground" }}
            >
              {turn.role === "you" ? "› " : "• "}
              {turn.text}
            </Label>
          ))}
          {busy && <Label style={{ color: "$dimmed" }}>• …thinking (Esc or ■ to stop)</Label>}
        </VBox>

        <View style={{ height: 1 }} />

        {/* Composer */}
        <ChatInput
          placeholder="Message the agent…"
          busy={busy}
          triggers={[mention, slash]}
          getHistory={() => history.current}
          onHintsChange={setHints}
          serialize={(tok) => `@${tok.label}`}
          suggestionProvider={({ value }) => {
            const key = value.toLowerCase();
            for (const [prefix, sfx] of Object.entries(GHOSTS)) {
              if (key === prefix) return sfx;
            }
            return null;
          }}
          onSubmit={(value) => {
            if (!value.trim()) return;
            history.current.push(value);
            setTurns((t) => [...t, { role: "you", text: value }]);
            fakeReply(value);
          }}
          onInterrupt={() => {
            if (timer.current) clearTimeout(timer.current);
            setBusy(false);
            setTurns((t) => [...t, { role: "agent", text: "(interrupted)" }]);
          }}
          onCommand={(name) => {
            if (name === "clear") setTurns([]);
            else setTurns((t) => [...t, { role: "agent", text: `(ran /${name})` }]);
          }}
        />

        <View style={{ height: 1 }} />
        <ExitButton style={{ margin: 0 }}>Exit</ExitButton>
      </VBox>
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const chatDemo: Demo = {
  id: "chat",
  title: "Chat Composer",
  group: "Text",
  description: "Feature-rich chat input: chips, completions, ghost-text, history, send/stop.",
  Component: ChatDemoApp,
};
