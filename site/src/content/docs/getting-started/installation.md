---
title: Installation
description: Install ztui's slim core and opt into only the feature entry points you use.
---

ztui ships as a **slim core** with **opt-in entry points**, so you only install the
dependencies for the features you actually use. The core entry pulls in no React
and no heavy rendering engines.

```bash
bun add ztui
```

## Entry points

| Import | What you get | Install alongside |
| --- | --- | --- |
| `ztui` | Core: `App`, `Widget`, `Screen`, drivers, geometry, render, theme, animations, and the imperative widgets | — |
| `ztui/react` | The React reconciler `render` + all JSX components and hooks | `bun add react react-reconciler` |
| `ztui/markdown` | Markdown engine + `MarkdownWidget` | `bun add marked` |
| `ztui/syntax` | Syntax highlighting + `SyntaxWidget` | `bun add prismjs` |
| `ztui/mermaid` | Mermaid diagrams + `MermaidWidget` | `bun add beautiful-mermaid` |

The extras are declared as **optional `peerDependencies`** — they are never
installed automatically, and the widgets that need them throw an actionable error
(or degrade gracefully) when missing. SVG-icon rasterization (Kitty/iTerm) uses an
optional `sharp`; Seti file icons use an optional `opentype.js`; both fall back to
Unicode glyphs when absent.

## A React + markdown app

```tsx
import { App } from "ztui";
import { Markdown, render } from "ztui/react";
import "ztui/markdown"; // registers the widget + pulls `marked`
import "ztui/syntax"; // optional: highlight fenced code via `prismjs`

const app = new App();
render(<Markdown># Hello, **ztui**</Markdown>, app.activeScreen);
app.run();
```

## Requirements

- **Bun** (the primary runtime) or Node 18+.
- A terminal for the terminal backend; any modern browser for the canvas backend.

Next: the [Quick Start](/ztui/getting-started/quick-start/).
