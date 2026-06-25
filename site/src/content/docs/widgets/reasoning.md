---
title: Reasoning & Streaming
description: A collapsible thinking block and inline text with a blinking caret — the two affordances for an in-progress agent turn.
---

![A ztui agent turn with a collapsible thinking block and streaming reply text](../../../assets/widgets/tool-call.png)

Two small primitives convey that a turn is still in progress: `<Reasoning>` folds
the model's thinking into a dim, collapsible block, and `<StreamingText>` shows a
blinking caret while tokens arrive.

## Reasoning

A collapsible "thinking" block: a dim `✻` header with a live spinner while
`active`, and the (streaming) reasoning text below — secondary chrome that folds
away. It expands while active and can collapse itself when reasoning finishes,
leaving a `"thought for 3s"` line.

```tsx
import { Reasoning, Markdown } from "@huyz0/ztui/react";

<Reasoning active={thinking} duration={thinking ? undefined : "thought for 3s"} collapseWhenDone>
  <Markdown trimTrailingMargin>{reasoningText}</Markdown>
</Reasoning>;
```

- `label` — header text (defaults to `"Thinking"`).
- `active` — while true, shows the spinner and stays expanded.
- `duration` — dim line shown once done.
- `collapseWhenDone` — auto-collapse when `active` turns false.
- `open` + `onToggle` (controlled) or `defaultOpen` (uncontrolled, defaults to
  whether it starts active). The body stays mounted while collapsed, so streamed
  text keeps accruing behind it.

## StreamingText

Inline text with a **blinking caret** while it streams — the token-by-token
"typing" affordance. Pass the accumulated text and flip `streaming` to `false`
when the turn completes; the caret then disappears. It animates itself off the
render clock (no ticking prop), and word-wraps long replies to the bubble width.

```tsx
import { StreamingText } from "@huyz0/ztui/react";

<StreamingText streaming={!done}>{reply}</StreamingText>;
```

- `streaming` — whether to show the caret.
- `caret` — caret glyph (defaults to `▋`).
- `blinkMs` — blink period.

For rich replies, render [`Markdown`](/ztui/widgets/markdown/) for the committed
text and use `StreamingText` only for the live tail.

[Full demo →](https://github.com/huyz0/ztui/blob/main/examples/tool_call_demo.tsx)
