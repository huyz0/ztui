---
title: Focus, keys & hotkeys
description: How keyboard focus moves, how widgets handle keys, and how to register global hotkeys and the command palette.
---

ztui routes the keyboard the way a desktop app does: one widget holds **focus**
and sees keys first, **Tab** moves focus between widgets, and **hotkeys** fire
above or below that, depending on the key. Understanding the order is the key to
building interactions that never swallow each other's input.

## Focus

A widget can hold keyboard focus only if it's **focusable**. Interactive widgets
(Input, Button, Select, …) set this for you; make a plain container focusable with
the `focusable` prop:

```tsx
<VBox focusable onKey={(ev) => { /* … */ }}>…</VBox>
```

The focused widget receives key events first (via its `handleKey` / `onKey`).
`widget.focused` reflects whether it currently holds focus, and built-in controls
use that to draw a focus ring (see [Animation & graphics](/ztui/guides/animation-graphics/)).

### Moving focus

- **Tab** advances focus to the next focusable widget; **Shift+Tab** goes back.
- The order is the widgets' position in the tree (document order), skipping
  hidden and `disabled` widgets.
- Disabling a container disables — and removes from the tab order — everything
  inside it.

You can also move focus programmatically through the screen:

```ts
app.activeScreen.focusWidget(myWidget); // focus a specific widget (or null to clear)
app.activeScreen.focusNext();           // next in tab order (pass true to reverse)
```

### Navigation *within* a widget

Tab moves *between* widgets; arrows and PageUp/PageDown move *inside* the focused
one. A focused Table, Tree, List, Select, or RadioGroup interprets ↑/↓ (and
PageUp/PageDown/Home/End where it makes sense) to move its cursor — that's the
widget's own `handleKey`, not a global binding. Custom widgets do the same:
override `handleKey`, act on `ev.name`, and set `ev.handled = true` for keys you
consume so they don't fall through.

```ts
override handleKey(ev: KeyEvent): void {
  if (ev.name === "down") { this.cursor++; ev.handled = true; this.app?.queueRender(); }
  else super.handleKey(ev);
}
```

## Hotkeys

Hotkeys are global, named shortcuts. The dispatch order is deliberate so they
coexist with typing:

- **Priority keys** — anything with Ctrl/Alt or an F-key — dispatch **before** the
  focused widget. A palette toggle or "save" works even while an input is focused.
- **Bare keys** — a single letter, `?`, `enter` — dispatch **after** the focus
  chain declines them, so a hotkey never eats text you're typing.

Register one with the `useHotkey` hook (React) — the handler is always read fresh,
so it closes over current state without re-registering:

```tsx
import { useHotkey } from "@huyz0/ztui/react";

useHotkey({ key: "ctrl+s", name: "Save", group: "File", handler: save });
```

Key specs are normalized: `"ctrl+shift+p"`, `"alt+enter"`, `"f5"`, `"?"`. Outside
React, use the `hotkeys` facade or `HotkeyRegistry` from `@huyz0/ztui`.

### Contexts

Hotkeys can be scoped to an app **context** so a binding is only live in, say, an
editor or a modal flow. A hotkey with no `context` is always active; otherwise it
fires only when its context matches:

```ts
import { hotkeys } from "@huyz0/ztui";

hotkeys.register({ key: "ctrl+]", name: "Indent", context: "editor", handler: indent });
hotkeys.setContext("editor");   // or pushContext("modal") / popContext()
```

An `enabled: () => boolean` gate can disable a hotkey dynamically (e.g. "only when
there's a selection"), and `hidden: true` keeps it working but out of the palette.

## The command palette

Mount `<HotkeyPalette>` once near your root to get a searchable overlay of every
registered hotkey, grouped by section — the discoverability layer over the
registry. Press its toggle key (default **Ctrl+Space**) to open it, type to
filter, arrow to a command, Enter to run it:

```tsx
import { HotkeyPalette } from "@huyz0/ztui/react";

<Dock>
  <HotkeyPalette toggleKey="ctrl+space" />   {/* or "f1", "ctrl+k", … */}
  …
</Dock>;
```

Because it reads the same registry, every `useHotkey` you add shows up
automatically — give each a clear `name`, `description`, and `group` and the
palette doubles as your app's help screen.
