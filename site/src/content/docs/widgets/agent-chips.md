---
title: Chips & Pills
description: Small inline tokens — tags, mentions, status pills, and clickable file citations — for annotating agent output.
---

![A ztui agent turn with a file-reference chip citing an edited file](../../../assets/widgets/tool-call.png)

Small inline tokens for annotating agent output: `<Chip>` is a tag / mention /
attachment, `<Pill>` is a compact status dot, and `<FileChip>` is a clickable
file citation.

## Chip

A small inline token. `fill` paints a solid colour block (terminal reverse video,
so the text always contrasts), `bracket` wraps the label in `[ ]`, and `dim` is
muted text. Add an `icon`, make it clickable with `onClick`, or removable with
`onRemove` (a trailing `×`).

```tsx
import { Chip } from "@huyz0/ztui/react";

<Chip icon="📎" onRemove={() => drop(id)}>config.json</Chip>
<Chip variant="bracket" color="$success">passed</Chip>
```

- `variant` — `"fill"` (default), `"bracket"`, or `"dim"`.
- `color` — accent token (defaults to `"$accent"`).
- `icon` / `onClick` / `onRemove`.

## Pill

A compact status pill — a coloured `●` dot and a label, for short states
("running", "queued", "3 staged"). Lighter than a chip; no background.

```tsx
import { Pill } from "@huyz0/ztui/react";

<Pill color="$success">ready</Pill>;
```

## FileChip

A clickable file citation: shows `basename:line` and reports the full path back
through `onOpen(path, line)` so the host can open it in an editor.

```tsx
import { FileChip } from "@huyz0/ztui/react";

<FileChip path="src/core/app.ts" line={461} onOpen={(p, l) => openInEditor(p, l)} />;
```

[Full demo →](https://github.com/huyz0/ztui/blob/main/examples/tool_call_demo.tsx)
