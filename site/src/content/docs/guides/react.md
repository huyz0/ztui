---
title: React binding
description: How ztui maps to React — mounting, the prop conventions every component shares, refs to widgets, and the built-in hooks.
---

ztui *is* React — a custom reconciler commits your components into the widget DOM
instead of the browser DOM. So you write ordinary function components with
`useState`, `useEffect`, props, and children; only the host elements (`<VBox>`,
`<Button>`, …) and a few hooks are ztui-specific. Import components from
`@huyz0/ztui/react` and the runtime from `@huyz0/ztui`.

## Mounting an app

```tsx
import { App } from "@huyz0/ztui";
import { render, VBox, Label } from "@huyz0/ztui/react";

function Hello() {
  return (
    <VBox style={{ padding: 1 }}>
      <Label style={{ color: "$primary" }}>Hello, ztui</Label>
    </VBox>
  );
}

const app = new App();              // terminal backend (BunDriver) by default
render(<Hello />, app.activeScreen); // mount the tree onto the root screen
app.run();                           // start the render/event loop
```

`render(element, screen)` is ztui's analogue of `createRoot().render`. `App`
owns the driver, capability probing, focus, and the frame scheduler; `app.run()`
starts it and `app.stop()` tears it down. State changes re-render through React →
the widget DOM → a fresh frame, exactly as you'd expect.

## Shared props

Every host component accepts a common set of props (in addition to its own):

| Prop         | Type                          | Purpose                                                        |
|--------------|-------------------------------|---------------------------------------------------------------|
| `style`      | `WidgetStyles`                | inline styles — see [Styling](/ztui/guides/styling/)          |
| `theme`      | `string`                      | re-theme this subtree — see [Theming](/ztui/guides/theming/)  |
| `id`         | `string`                      | stable id (handy for tests / lookups)                         |
| `label`      | `string`                      | accessible/structural label (also a tab title in `TabContainer`) |
| `focusable`  | `boolean`                     | make a plain container focusable                              |
| `disabled`   | `boolean`                     | mark inert; propagates to descendants                         |
| `ref`        | `React.Ref<Widget>`           | capture the underlying widget instance                        |
| `onClick`    | `(ev) => void`                | pointer click                                                 |
| `onKey`      | `(ev) => void`                | key event when focused                                        |
| `onScroll`   | `(ev) => void`                | wheel / scroll                                                |
| `onMouseEnter` / `onMouseLeave` | `(ev) => void`   | hover enter/leave                                             |
| `onDragStart` / `onDragMove` / `onDragEnd` | `(x, y, …) => void` | pointer-drag lifecycle                              |

Form controls additionally share `validators` / `validateOn` / `onValidate` —
see the [Form widget](/ztui/widgets/form/).

## Refs to widgets

A `ref` gives you the underlying `Widget` instance (React 19 ref-as-prop). The
ref defaults to the base `Widget`; narrow it with a cast when you need a
subclass's fields or methods:

```tsx
import { useRef } from "react";
import { Input } from "@huyz0/ztui/react";
import type { InputWidget } from "@huyz0/ztui";

const inputRef = useRef<InputWidget>(null);
<Input ref={inputRef as React.Ref<InputWidget>} />;
// inputRef.current?.focus()
```

## Hooks

These ship from `@huyz0/ztui/react`:

### `useHotkey`

Register a global, named shortcut for the component's lifetime. Mounted
`<HotkeyPalette>` lists every registered hotkey (press `?` by convention).

```tsx
import { useHotkey } from "@huyz0/ztui/react";

useHotkey({ key: "ctrl+s", name: "Save", group: "File", handler: save });
```

Options: `key` (e.g. `"ctrl+s"`, `"alt+enter"`, `"f5"`, `"?"`), `name`,
optional `description`, `group`, and `handler`. The handler is always read fresh,
so it closes over current state without re-registering.

### `useToast`

Returns the imperative `toast` façade for transient notifications. Mount
`<ToastHost>` once near the root to display them.

```tsx
import { useToast } from "@huyz0/ztui/react";

const toast = useToast();
toast.success("Saved");
toast.error("Upload failed", { duration: 0 }); // 0 = sticky until dismissed
const id = toast.info("Reconnecting…");
toast.dismiss(id);
```

Levels: `info`, `success`, `warn`, `error`, `generic`, plus `show`, `dismiss`,
and `clear`.

### `useWorker`

A cancellable async-task primitive — the UI analogue of an agent run. Exactly one
run is in flight at a time: calling `run` again aborts the previous one, and a
superseded run can no longer change state ("latest wins"). The task receives an
`AbortSignal`, and the run is aborted automatically on unmount.

```tsx
import { useWorker } from "@huyz0/ztui/react";

const job = useWorker<string>();
// job.status: "idle" | "running" | "success" | "error" | "cancelled"
// job.data, job.error, job.isRunning
job.run((signal) => callModel(prompt, { signal }));
// <Button onClick={job.cancel}>Cancel</Button>
```

### `useAnimatedValue` / `useAnimatedColor`

Tween a number or color toward a target whenever it changes; the hook returns the
current interpolated value to render. See the [Animation framework](/ztui/guides/architecture/).

```tsx
import { useAnimatedValue } from "@huyz0/ztui/react";

const width = useAnimatedValue(open ? 40 : 0, { duration: 200, easing: "out-cubic" });
<VBox style={{ width }} />;
```

Options: `duration` (ms, default 300), `easing` (default `"out-cubic"`),
`onComplete`.

### `useLayer`

Low-level primitive behind the overlay components (`Dialog`, `StickyPanel`,
`ThemePalette`, …) for portalling content to a screen-level layer. Prefer the
[overlay components](/ztui/widgets/overlays/) unless you're building a new kind of
floating surface.

## What's *not* different

Everything else is plain React: component composition, `children`, `key`,
conditional rendering, `useState`/`useReducer`/`useEffect`/`useMemo`/`useContext`,
and your own custom hooks all work unchanged. The only rule is that host elements
must be ztui components (you can't render a `<div>`), because they commit to the
widget DOM, not the browser's.
