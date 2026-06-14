---
title: Styling
description: The style prop — colors, theme tokens, and text attributes — and how values resolve to terminal cells.
---

Widgets are styled with a single `style` prop: a plain object of properties,
inline like React's `style` but typed to what a terminal cell can actually show.
There are no stylesheets to wire up for the common case — set properties and
they apply.

```tsx
import { Label } from "@huyz0/ztui/react";

<Label style={{ color: "$primary", bold: true, background: "$surface" }}>
  Hello
</Label>;
```

## Colors

`color` (foreground) and `background` accept:

- **Theme tokens** — `"$primary"`, `"$surface"`, `"$error"`, … Resolve against the
  active theme, so they adapt when the theme changes. **Prefer these** — see
  [Theming](/ztui/guides/theming/) for the full token list.
- **Hex** — `"#4daafc"` (truecolor; degraded automatically on 256-color terminals).
- **Named colors** — standard CSS/ANSI names like `"red"`, `"cyan"`, `"gray"`.
- **`"transparent"`** — let the layer below show through.

```tsx
<VBox style={{ background: "$panel" }}>
  <Label style={{ color: "$success" }}>ok</Label>
  <Label style={{ color: "#e06c75" }}>literal hex</Label>
</VBox>
```

### Theme tokens (`$name`)

Any string value may embed `$name` (or the CSS form `var(--name)`); it's replaced
with the active theme's color before painting. This is the portable way to color
things — the same widget tree looks right under every theme and on both backends.
Tokens resolve per-widget, so a widget's [`theme` override](/ztui/guides/theming/#per-subtree-themes)
flows to its descendants.

## Text attributes

Booleans toggle terminal cell attributes:

| Property        | Effect                          |
|-----------------|---------------------------------|
| `bold`          | bold / bright text              |
| `italic`        | italic (where the terminal supports it) |
| `underline`     | underline                       |
| `strikethrough` | struck-through                  |
| `dim`           | reduced intensity               |
| `reverse`       | swap fg/bg                      |

```tsx
<Label style={{ bold: true, underline: true }}>emphasis</Label>
```

`link: "https://…"` marks the text as a hyperlink (OSC 8) on terminals that
support it.

## Box properties

Sizing, spacing, borders, alignment, docking, and overflow are all set through
the same `style` object and are covered in [Layout](/ztui/guides/layout/):
`width`/`height`, `padding`/`margin`, `border`/`borderColor`, `align`, `dock`,
`overflowX`/`overflowY`, and so on.

## Defaults and precedence

Every widget has a `defaultStyle` (its built-in look) that your `style` props
override key-by-key. So you only specify what differs:

```tsx
<Button style={{ background: "$success" }}>Save</Button>  // keeps the rest of Button's look
```

Interactive widgets (`Button`, `Input`, `Select`, …) manage their own
**focus** and **hover** visuals — a focused control gets a gently animated focus
ring, hovered controls highlight — so you don't style those states by hand. For
custom `:hover` / `:focus` rules on your own widgets you can load a CSS-like
stylesheet with pseudo-selectors, but inline `style` plus theme tokens covers
nearly everything.

## How a value becomes a cell

When a frame renders, each widget's `style` is resolved into a concrete
`computedStyle`: `$tokens` are looked up against the active theme, focus/hover
state is folded in, and the result is written into the [ScreenBuffer](/ztui/guides/architecture/)
as per-cell character + colors + attributes. Colors that the terminal can't show
natively are degraded (truecolor → 256 → 16) by the driver, so you author once in
hex or tokens and let the backend match the device.
