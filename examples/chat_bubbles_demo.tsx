import { Box, ChatBubble, Dock, Footer, Header, VBox } from "../src/react.ts";
import { quitHint } from "./exit-button.tsx";

// A single-side accent bar turns a plain box into a chat bubble: the bar's
// COLOR says who the message is from (and how important it is) — the same
// info/warn/error idea Toast uses — and its WEIGHT adds emphasis. No corners,
// just a clean colored edge down one side. `ChatBubble`'s `align` prop also
// caps the bubble width and pushes it to the left/right edge of the panel —
// user turns on the right, assistant/system on the left — so the two speakers
// visually split the transcript instead of stacking as full-width blocks.
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
      <Header>💬 ZTUI Chat Bubbles — accent bars (color = who) + left/right alignment</Header>
      <Footer>
        Border color conveys sender/importance, like Toast info/warn/error{quitHint()}
      </Footer>

      <VBox style={{ padding: 1 }}>
        {THREAD.map((m) => (
          <Box key={`${m.who}:${m.text}`} style={{ width: "100%", margin: { bottom: 1 } }}>
            <ChatBubble
              role={m.from}
              author={m.who}
              align={m.from === "user" ? "right" : "left"}
              accent={{
                color: m.color,
                weight: m.weight,
                side: m.from === "user" ? "right" : "left",
              }}
              background="$surface"
            >
              {m.text}
            </ChatBubble>
          </Box>
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
  description:
    "One-sided accent-bar borders (color = sender/importance, weight = emphasis) with ChatBubble's align prop splitting user/assistant turns left/right.",
  Component: ChatBubblesDemo,
};
