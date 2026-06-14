---
title: Why ztui
description: The problem ztui exists to solve — TUI frameworks are either too primitive or optimize for raw render speed at the cost of debuggability.
---

Most TUI toolkits sit at one of two extremes.

Some are **too primitive** — raw ANSI, or thin wrappers where you hand-roll
layout, focus, scrolling, and every widget yourself. You spend your time
rebuilding a UI toolkit instead of building your app.

Others chase **maximal performance** with native render backends. They're fast,
but hard to see into: the UI exists only as bytes painted to a terminal, so
debugging is print-statements-and-squinting, and there's nothing concrete for a
test to assert on.

## The bet ztui makes

On a modern machine, a TUI paints a few thousand cells per frame. Raw render
throughput is rarely what's slow — **iteration speed and debuggability are.**

That's truer than ever now that so much code is written and maintained by **LLMs
and agents**, which can't sit and watch a terminal scroll by. An agent (or your
CI) needs to *read* the current screen and *act* on it programmatically. A native
byte-stream backend gives it nothing to grab onto.

So ztui optimizes for a model you — and an agent — can reason about, test, and
operate:

- **A familiar mental model.** One declarative [React](/ztui/guides/react/) tree,
  hooks and all. No bespoke layout DSL to learn.
- **Everything serializes.** The widget DOM and the rendered frame export to
  JSON, HTML, and plain text — see [Architecture](/ztui/guides/architecture/).
- **Headless and inspectable.** Headless drivers and a REST inspector let humans,
  CI, and agents *see* and *assert* on the UI with no real terminal — see
  [Debugging & AI agents](/ztui/guides/debugging/).

## An honest take on performance

This is **not** "slow but debuggable." ztui stays performance-conscious — ANSI
cell diffing so only changed cells repaint, list/table virtualization for huge
data, synchronized output to avoid tearing, and lazy/native graphics. For the
tools, dashboards, and agent UIs it targets, it's fast.

What it deliberately does is trade a sliver of raw native throughput for a
framework that's **legible end-to-end**. The honest guidance:

- Building a 60fps fullscreen game or a million-row live render in the terminal?
  A native engine (Rust/C) will beat it on raw frames-per-second.
- Building tools, dashboards, dev experiences, or agent-operated UIs — and want
  them testable and AI-operable? That's the gap ztui fills.

If debuggability and a real component model are worth more to you than the last
few percent of render throughput — especially with agents in the loop — ztui is
built for exactly that trade.
