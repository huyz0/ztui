---
title: Debugging & AI agents
description: ztui's UI serializes to text/HTML/JSON and runs headless, so humans, CI, and AI agents can see and assert on the interface without a real terminal.
---

A ztui UI is never a black box. The widget DOM and the rendered frame **serialize
to plain text, HTML, and JSON**, the app runs **headless** with no TTY, and a
**REST inspector** exposes the live screen over HTTP. That's what makes ztui
practical to test in CI and to operate with an LLM agent — the thing a native
byte-stream backend can't give you (see [Why ztui](/ztui/getting-started/why-ztui/)).

## Serialize any frame

The composed cell grid renders to text or styled HTML — no terminal required:

```ts
import { App, MockDriver, renderBufferToText, renderBufferToHTML } from "@huyz0/ztui";
import { render } from "@huyz0/ztui/react";

const app = new App(new MockDriver(40, 10)); // headless, fixed-size grid
render(<MyUI />, app.activeScreen);
app.run();

renderBufferToText(app.buffer);  // the screen as plain text
renderBufferToHTML(app.buffer);  // the screen as styled HTML (for snapshots)
```

`MockDriver` is a no-TTY backend built for this: it captures output and lets you
inject input, so the same widget tree you ship runs in a test or a script.

## Assert on the UI in a test

Because the frame is text, assertions are ordinary string checks — no
screenshots, no flaky pixel diffs:

```ts
import { App, MockDriver, renderBufferToText } from "@huyz0/ztui";
import { render } from "@huyz0/ztui/react";

test("counter increments", async () => {
  const driver = new MockDriver(40, 5);
  const app = new App(driver);
  render(<Counter />, app.activeScreen);
  app.run();
  await new Promise((r) => setTimeout(r, 15)); // let React commit + render

  driver.simulateKey({ key: "enter", name: "enter", ctrl: false, meta: false, shift: false });
  await new Promise((r) => setTimeout(r, 15));

  expect(renderBufferToText(app.buffer)).toContain("Count: 1");
  app.stop();
});
```

`MockDriver` exposes `simulateKey` / `simulateMouse` / `simulateResize` to drive
the app, and `writtenData` to assert on raw output.

## The live REST inspector

For a *running* app, `startInspector(app)` serves the live screen over HTTP — so a
human, a script, or an agent can watch and drive it from outside the process:

```ts
import { startInspector } from "@huyz0/ztui";
const inspector = startInspector(app, 8000); // GET endpoints + POST /input
```

:::caution[The inspector has no authentication]
`POST /input` can drive your app, so the server **binds to `127.0.0.1`
(loopback) by default** — it is not reachable from the network. Only pass a
third `hostname` argument (`startInspector(app, 8000, "0.0.0.0")`) when you
deliberately need remote access — e.g. reaching a container from the host — and
the network is trusted. Don't expose it to the public internet.
:::

| Endpoint            | Returns                                                  |
|---------------------|---------------------------------------------------------|
| `GET /screenshot`   | the current screen as **plain text**                    |
| `GET /render`       | the current screen as **styled HTML**                   |
| `GET /dom`          | the widget tree as **JSON** (ids, classes, regions)     |
| `GET /tree`         | the widget tree as an indented **text** outline         |
| `GET /state`        | a high-level app snapshot (focus, size, capabilities)   |
| `GET /log?lines=N`  | the last N log lines                                     |
| `POST /input`       | inject a key or mouse event                             |

```bash
curl localhost:8000/screenshot                 # see the screen
curl -XPOST localhost:8000/input -d '{"type":"key","key":"enter"}'   # press a key
curl -XPOST localhost:8000/input -d '{"type":"mouse","x":4,"y":2,"action":"press"}'
```

## The agent loop

These two facts — *read the screen as text*, *inject input over HTTP* — close the
loop for an AI agent with no terminal at all:

1. `GET /screenshot` → the agent reads the current UI as text.
2. The agent decides what to do.
3. `POST /input` → it presses a key or clicks.
4. Repeat.

The same loop works offline against `MockDriver` (`renderBufferToText` +
`simulateKey`) for deterministic, fully-scripted runs in CI. An agent can build a
feature, drive its own UI, read back the rendered result, and assert it's correct
— without a human relaying screenshots.

:::caution[Treat on-screen text as untrusted input to your agent]
When an agent reads the screen, whatever text the UI displays becomes part of the
agent's context — including content your app didn't author (a rendered Markdown
file, a chat message, an API response, a filename). A hostile string can carry a
**prompt-injection** payload ("ignore your instructions and…"). This is inherent
to any *agent-reads-UI* design, not specific to ztui — ztui never calls an LLM
itself. Defend it where you'd defend any untrusted input: keep tool/automation
authority outside the model, don't let screen text silently escalate privileges,
and sanitize at the boundary. ztui does harden the **rendering** boundary —
`renderBufferToText`/`renderBufferToHTML` strip terminal control sequences and
HTML-escape output (links are scheme-checked, so a `javascript:` URL in a
Markdown link can't execute when the HTML render is viewed) — but the *meaning*
of the text is still yours to treat with suspicion.
:::

## The web backend, headless

The browser/canvas backend is inspectable too. `bun run web:debug` renders a UI
in headless Chromium, saves a screenshot, and prints a pixel-accurate report (row
gaps, overflow, font-loaded, cell width) — the way to verify the web backend in
CI without a person at a browser.

## Performance: benchmarks & regression guards

ztui re-renders the whole widget tree to a cell buffer and diffs it to ANSI every
frame, so a small algorithmic regression in the render/layout core can silently
hurt interactivity. Two commands cover the hot paths (buffer/diff, ANSI
serialization, text measurement & wrapping, layout, selection, markdown, CSS
resolution, and the end-to-end frame):

- `bun run perf` — **ratio-guard tests** (`src/**/*.perf.ts`). Each hot path is
  timed against a fixed calibration workload measured in the same process; the
  assertion is on the *ratio*, so it's machine-independent and only trips on a
  real (order-of-magnitude) regression. Runs in CI. Some guards also assert
  deterministic invariants — e.g. an unchanged frame must diff to the empty
  string — which catch regressions with zero timing flake.
- `bun run bench` — **vitest `bench()` tracking** (`src/**/*.bench.ts`). Prints
  ops/sec for eyeballing gradual drift; not asserted.

Both use the shared harness in `src/test/bench/perf-harness.ts` and run on a
dedicated config (`vitest.config.perf.ts`), kept out of the default coverage gate
so commits stay fast. Budgets are committed constants set to ≈3× a healthy run;
if you make a deliberate change that moves a baseline, retune the budget in that
`.perf.ts` file (the failure message prints the observed ratio).

## Why this is the selling point

Every other guarantee in ztui flows from this: a [custom widget](/ztui/guides/extending/)
is correct if its serialized output is correct; a regression shows up as a text
diff; an agent can operate an interface it can't see. The UI is **data you can
query**, not pixels you have to look at — which is exactly what testing and
AI-assisted development need.
