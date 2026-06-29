---
title: Testing
description: Test ztui UIs headlessly with @huyz0/ztui/testing — the same harness the framework uses on itself.
---

ztui ships its own test harness as a public entry, **`@huyz0/ztui/testing`** — the
exact harness the framework uses on itself. It renders a component tree into a
real `App` on a headless, scriptable terminal (no TTY), then lets you assert on
the painted output and drive real key/mouse input. It's **runner-agnostic** (it
imports no test framework), so it works with Vitest, Jest, `bun test`, or
`node:test`.

## Setup

Wire teardown to your runner once, then mount and assert:

```tsx
import { afterEach, expect, test } from "vitest";
import { mountApp, cleanupMountedApps } from "@huyz0/ztui/testing";
import { Counter } from "./Counter";

afterEach(cleanupMountedApps);

test("clicking the button increments", async () => {
  const t = await mountApp(<Counter />, { cols: 30, rows: 6 });
  await t.settle();

  t.driver.emit("mouse", { type: "press", button: "left", x: 1, y: 1 });
  await t.settle();

  expect(t.text()).toContain("count: 1");
});
```

`cleanupMountedApps()` stops the event loop, unmounts the React tree, and resets
the global hotkey registry for everything `mountApp` created — so tests never
leak timers or stale trees into each other.

## What `mountApp` gives you

`mountApp(ui, opts?)` returns a result with:

- `text()` — the painted screen as plain text (assert on what the user sees).
- `findById(id)` — the widget with a given `id` (read its `region`, `value`, …).
- `cellAt(x, y)` — a single screen cell (`char` + resolved `style`), for
  pixel-precise checks (colour, reverse, a glyph at a coordinate).
- `settle(ms?)` — await React commits + a render frame (call after any state change).
- `driver` — the headless `VTEDriver`; drive input with `driver.emit("key", …)`
  / `driver.emit("mouse", …)`, or read `driver` output.
- `app`, `screen`, `buffer` — the live instances, for deeper assertions.

`opts` takes `{ cols, rows, capabilities, screenStyle }` to size the virtual
terminal and set backend capabilities.

## Async and animation

For anything that settles on its own schedule — an effect firing, an async image
rasterize, a tween — prefer `waitFor` over a single fixed `settle`, so the test
isn't a flaky race against one timer:

```ts
import { waitFor } from "@huyz0/ztui/testing";

await waitFor(() => t.text().includes("loaded"), { timeout: 1000 });
```

`flush(ms?)` (a bare microtask + `ms` macrotask wait) and `mountTestApp` (the
un-tracked `mountApp`, if you manage teardown yourself) are also exported.

## Driving input

The `VTEDriver` is a scriptable [xterm.js](https://xtermjs.org/) backend, so input
goes through the **real** key/mouse pipeline:

```ts
t.driver.emit("key", { key: "right", name: "right", ctrl: false, meta: false, shift: false });
t.driver.emit("mouse", { type: "press", button: "left", x: 4, y: 2 });
```

This is the same path the framework's own ~1200 tests use, so your app tests
exercise focus traversal, hotkeys, and event bubbling exactly as production does.
