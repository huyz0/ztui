---
title: Tool Calls
description: Collapsible tool-call cards and a per-tool renderer registry that draws each tool's request and result its own way.
---

![A ztui agent transcript with tool-call cards: a Bash run with streaming output and an Edit shown as a diff](../../../assets/widgets/tool-call.png)

The Agent Kit renders an agent's tool use two ways: `<ToolCall>` is a single
collapsible card, and `<ToolRender>` picks a **per-tool renderer** from a registry
so each tool draws its request and result its own way (a `Bash` run as a
highlighted command plus streaming output, an `Edit` as a diff, and so on).

## ToolCall

A collapsible card: a disclosure triangle, a status badge (`○` pending, `◐`
running, `✔` success, `✖` error), an optional icon, the tool name, dimmed args,
and a right-aligned summary while collapsed. The body is revealed when open.

```tsx
import { ToolCall } from "@huyz0/ztui/react";

<ToolCall name="Bash" args="npm test" status="success" summary="exit 0" icon="🖥️" defaultOpen>
  <Markdown>…command output…</Markdown>
</ToolCall>
```

- `name` / `args` / `status` / `summary` / `icon` — header content.
- `accent` — optional one-sided accent bar (as on [`ChatBubble`](/ztui/widgets/chat-bubble/)).
- `open` + `onToggle` (controlled) or `defaultOpen` (uncontrolled). With no body,
  the disclosure triangle is omitted.

## ToolRender

`<ToolRender>` looks up a renderer by `call.name` from `DEFAULT_TOOL_RENDERERS`
and falls back to a plain card otherwise. Spread the defaults to register your
own — the library never hardcodes tool semantics.

```tsx
import { ToolRender } from "@huyz0/ztui/react";

<ToolRender
  defaultOpen
  call={{
    name: "Bash",
    args: "npm test",
    status: "success",
    data: { command: "npm test", output: ["PASS  app.test.ts"], exitCode: 0 },
  }}
/>;
```

Built-in renderers compose existing widgets:

- **`bashToolRenderer`** — a highlighted [`Syntax`](/ztui/widgets/rich-text/) command
  plus a streaming [`Rich Log`](/ztui/widgets/rich-log/) of `data.output`, with an
  `exit N` summary.
- **`diffToolRenderer`** — old/new text as a [`Diff`](/ztui/widgets/diff/).
- **`writeToolRenderer`** — file content as highlighted syntax.
- **`textToolRenderer`** — Markdown, the generic fallback.

A renderer is `{ icon?, accent?, summary?(ctx), renderBody?(ctx) }` keyed by tool
name; register custom tools by extending the map you pass to `renderers`.

[Full demo →](https://github.com/huyz0/ztui/blob/main/examples/tool_call_demo.tsx)
