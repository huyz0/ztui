import { Dock, Footer, Header, Label, VBox } from "../src/react.ts";
import { quitHint } from "./exit-button.tsx";

// A single-side accent bar turns a plain box into a chat bubble: the bar's
// COLOR says who the message is from (and how important it is) — the same
// info/warn/error idea Toast uses — and its WEIGHT adds emphasis. No corners,
// just a clean colored edge down one side.
interface Message {
  from: "user" | "assistant" | "system";
  weight: "thin" | "heavy" | "bar";
  color: string;
  who: string;
  text: string;
}

const THREAD: Message[] = [
  {
    from: "user",
    weight: "heavy",
    color: "$primary",
    who: "You",
    text: "How do I add a left accent bar to a box?",
  },
  {
    from: "assistant",
    weight: "thin",
    color: "$dimmed",
    who: "Assistant",
    text: "Set `borderLeft` to a weight and `borderColor` to any color — no corners, just that edge.",
  },
  {
    from: "user",
    weight: "heavy",
    color: "$primary",
    who: "You",
    text: "And to flag an important one?",
  },
  {
    from: "system",
    weight: "bar",
    color: "$error",
    who: "System",
    text: "Rate limit reached — a solid `bar` in $error reads as urgent.",
  },
  {
    from: "assistant",
    weight: "thin",
    color: "$success",
    who: "Assistant",
    text: "A green thin bar can mean 'done / success', mirroring Toast's coloring.",
  },
];

function ChatBubblesDemo() {
  return (
    <Dock style={{ background: "$background" }}>
      <Header>
        💬 ZTUI Chat Bubbles — one-sided accent bars (color = who · weight = emphasis)
      </Header>
      <Footer>
        Border color conveys sender/importance, like Toast info/warn/error{quitHint()}
      </Footer>

      <VBox style={{ padding: 1 }}>
        {THREAD.map((m) => (
          <VBox
            key={`${m.who}:${m.text}`}
            style={{
              borderLeft: m.weight,
              borderColor: m.color,
              background: "$surface",
              padding: { left: 1, right: 1 },
              margin: { bottom: 1 },
            }}
          >
            <Label style={{ color: m.color, bold: true }}>{m.who}</Label>
            <Label style={{ color: "$foreground" }}>{m.text}</Label>
          </VBox>
        ))}
      </VBox>
    </Dock>
  );
}

import type { Demo } from "./gallery/types.ts";

export const chatBubblesDemo: Demo = {
  id: "chat-bubbles",
  title: "Chat Bubbles",
  group: "Layout",
  description: "One-sided accent-bar borders: color = sender/importance, weight = emphasis.",
  Component: ChatBubblesDemo,
};
