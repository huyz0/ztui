---
title: Extending ztui
description: Build your own widget — subclass Widget, register it, and bind it to JSX — plus the stability contract that keeps custom code working across releases.
---

Most UIs are built by **composing** the [built-in widgets](/ztui/widgets/) and
styling them. Reach for a custom widget only when you need to paint cells
yourself (a chart, a gauge, a domain-specific visual) or handle input in a way no
existing widget covers. When you do, ztui gives you a small, stable surface: you
subclass one class, override a few methods, and register it.

## The model

A widget is a node in the tree with a region (its rectangle in terminal cells)
and three jobs each frame:

```
measure  →  layout  →  render
```

- **measure** — you compute your intrinsic size from the space the parent offers.
- **layout** — the engine assigns your `region` from your styles (you don't do this).
- **render** — you paint cells into the `ScreenBuffer` for your region.

You override `measure` and `render` (and optionally the input handlers and
lifecycle hooks). Everything else — sizing math, focus routing, the diff to the
terminal, the canvas backend — is the engine's job and you get it for free.

Crucially, you paint into a **backend-neutral cell grid**, not ANSI. The same
custom widget renders in a terminal *and* in the browser canvas with no extra
work — so never emit escape codes from a widget. (See [Architecture](/ztui/guides/architecture/).)

## A complete example

A `Gauge` — a horizontal bar that fills to a `value` between 0 and 1. It shows
every moving part: a subclass, the `measure`/`render` overrides, reading resolved
styles, registering the element, and a typed JSX component.

### 1. Subclass `Widget`

```ts
import { Widget, Style, type ScreenBuffer } from "@huyz0/ztui";

export class GaugeWidget extends Widget {
  // A plain public field — the React binding forwards a matching prop onto it.
  public value = 0;

  // Content-sized height: one row tall, as wide as offered.
  override measure(maxW: number, maxH: number): void {
    super.measure(maxW, maxH);
    this.measuredWidth = maxW;
    this.measuredHeight = 1;
  }

  override render(buffer: ScreenBuffer): void {
    super.render(buffer); // paints background + border, if any
    const r = this.getContentRect(); // inside padding + border
    // computedStyle is already resolved — any $token in `color` is a concrete
    // color here. (For a built-in default, set `this.defaultStyle = { color: "$primary" }`
    // in the constructor; the caller's `style` still overrides it.)
    const style = new Style({ color: this.computedStyle.color });
    const filled = Math.round(Math.max(0, Math.min(1, this.value)) * r.width);
    for (let x = 0; x < r.width; x++) {
      buffer.setCell(r.x + x, r.y, x < filled ? "█" : "░", style);
    }
  }
}
```

Notes that matter:

- **Paint inside `getContentRect()`.** The parent clips children to its content
  box by default, so anything you draw outside your region is dropped — staying
  inside is both correct and safe.
- **Read `this.computedStyle`, not `this.style`.** By render time the engine has
  resolved `$theme` tokens, hover/focus state, and defaults into `computedStyle`,
  so `computedStyle.color` is a concrete color string ready for `Style`.
- **Keep `render` pure and fast.** It runs every frame. Don't mutate the tree or
  start work there — use `onMount` for that.

### 2. Bind it to JSX (and register in one step)

`hostComponent` builds a React component for a host tag. Pass your widget factory
as the second argument and it **registers the tag for you** — no separate call.
Every prop is forwarded to the host element; the reconciler assigns any prop
whose name matches a field on your widget (so `value` lands on
`GaugeWidget.value`). Type the props by extending `ComponentProps` to get the
shared props (`style`, `id`, `ref`, …) for free:

```tsx
import { hostComponent, type ComponentProps } from "@huyz0/ztui/react";
import { GaugeWidget } from "./gauge-widget";

interface GaugeProps extends ComponentProps {
  value?: number;
}

export const Gauge = hostComponent<GaugeProps>("ztui-gauge", () => new GaugeWidget());
```

That's the whole binding. Under the hood the factory is registered in the
framework-neutral core registry via `registerElement` — which you can still call
directly (`import { registerElement } from "@huyz0/ztui"`) when you're not using React.
That separation is deliberate: the widget layer knows nothing about React, so a
binding for another framework (Solid, Vue, …) wires the *same* `registerElement`
into its own component factory. `hostComponent` is simply React's wrapper for it.

### 3. Use it

```tsx
import { Gauge } from "./gauge";

<Gauge value={0.6} style={{ color: "$success", width: "50%" }} />;
```

It now participates fully: layout sizes it, theme tokens color it, it renders on
both backends, and a `ref` hands you the live `GaugeWidget` instance.

## Handling input

Set `focusable = true` to receive keyboard focus, then override the handlers.
Mark events you consume with `ev.handled = true` so they don't fall through to
global hotkeys or parent widgets.

```ts
import { Widget, type KeyEvent, type MouseEvent } from "@huyz0/ztui";

class Stepper extends Widget {
  public value = 0;
  public focusable = true;

  override handleKey(ev: KeyEvent): void {
    if (ev.name === "up") {
      this.value++;
      ev.handled = true;
      this.app?.queueRender();
    } else {
      super.handleKey(ev); // keeps the onKey passthrough
    }
  }

  override handleMouse(ev: MouseEvent): void {
    super.handleMouse(ev); // keeps the drag-source lifecycle
    if (ev.type === "press") {
      this.value++;
      ev.handled = true;
    }
  }
}
```

`handleScroll(ev)` is the wheel equivalent. Call `this.app?.queueRender()` after
changing internal state so the change is painted; props driven by React re-render
automatically.

## Lifecycle and side effects

`onMount()` runs once when the widget enters the live tree, `onUnmount()` once
when it leaves. Acquire in one, release in the other so nothing leaks:

```ts
class Clock extends Widget {
  private timer?: ReturnType<typeof setInterval>;
  override onMount(): void {
    this.timer = setInterval(() => this.app?.queueRender(), 1000);
  }
  override onUnmount(): void {
    clearInterval(this.timer);
  }
}
```

## The override contract

These are the methods you may override on `Widget`. Together they're the **stable
extension surface** — they keep working as the engine's internals change.

| Method                       | Override to…                                                  |
|------------------------------|--------------------------------------------------------------|
| `measure(maxW, maxH)`        | compute `measuredWidth` / `measuredHeight` (content sizing)  |
| `render(buffer)`             | paint your cells (call `super.render` to keep bg/border)     |
| `renderChildren(buffer)`     | unusual child handling (rarely needed)                       |
| `handleKey(ev)`              | keyboard interaction (needs `focusable`)                     |
| `handleMouse(ev)`            | click/drag interaction                                       |
| `handleScroll(ev)`           | wheel interaction                                            |
| `onMount()` / `onUnmount()`  | acquire / release side effects                               |
| `getTextContent()`           | customize the text a parent reads from you                   |

Useful helpers you call (not override): `getContentRect()` / `getClientRect()`
(your drawable rects), `animate(key, target)` / `animateColor(...)` (frame-driven
tweens), `findResolvedBackground()`, and `this.app?.queueRender()`.

## Stability: what's safe to depend on

ztui follows open/closed — **open** for new widgets through the surface above,
**closed** against reaching into internals that can change. The boundary is the
package's published entry points:

| Import from        | Stable surface                                                            |
|--------------------|---------------------------------------------------------------------------|
| `@huyz0/ztui`             | `Widget`, `registerElement`, `Style`, `ScreenBuffer`, geometry (`Region`, `Offset`, `Size`, `Spacing`), `KeyEvent`/`MouseEvent`, `App`, theming, icon registry |
| `@huyz0/ztui/react`       | `hostComponent`, `presetBox`, `ComponentProps`, all components and hooks   |

Only import from these entry points. The reconciler, the layout engine, the
host-config, and other deep modules are **not** part of the public API and aren't
reachable through the package's `exports` map — building on them risks breaking on
any release. If you find yourself needing something that isn't exported, that's a
signal to open an issue rather than deep-import.

The full, generated reference for every public class, method, and type — with the
override points documented inline — lives under
[API Reference → ztui (core)](/ztui/api/core/readme/) and
[ztui/react](/ztui/api/react/readme/).
