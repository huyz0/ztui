---
title: Theming
description: Theme tokens, the built-in palettes, switching and registering themes, per-subtree overrides, and the live picker.
---

A theme is a named set of semantic colors. Widgets reference those colors by
**token** (`$primary`, `$surface`, …) rather than literal hex, so one widget tree
re-colors itself completely when the active theme changes — no per-widget edits.

## Tokens

Use these in any `color` / `background` (and anywhere a style value is a string,
via `$name` or `var(--name)` — see [Styling](/ztui/guides/styling/)):

| Token         | Role                                            |
|---------------|-------------------------------------------------|
| `$background` | app backdrop                                    |
| `$foreground` | default text                                    |
| `$surface`    | raised surface (cards, panels)                  |
| `$panel`      | a second elevation above surface                |
| `$primary`    | primary accent / interactive                    |
| `$secondary`  | secondary accent                                |
| `$accent`     | tertiary accent / highlights                    |
| `$success`    | positive state                                  |
| `$warning`    | caution state                                   |
| `$error`      | error / destructive state                       |
| `$border`     | border lines                                    |
| `$dimmed`     | de-emphasized text                              |

Syntax-highlighting tokens (`$keyword`, `$string`, `$number`, `$comment`, …) and
UI accents (`$focus`, `$selectionBg`) are also defined; the [Markdown](/ztui/widgets/markdown/)
and [Diff](/ztui/widgets/diff/) widgets use them automatically.

## Built-in themes

ztui ships a large set of popular palettes, including `default-dark` (the
default) and `default-light`, plus `catppuccin-mocha` / `-macchiato` / `-frappe`
/ `-latte`, `nord`, `dracula`, `gruvbox-dark` / `-light`, `tokyo-night`,
`one-dark`, `rose-pine`, `monokai`, `everforest`, `solarized-dark` / `-light`,
`cobalt2`, `poimandres`, `kanagawa`, `github-dark`, `horizon`, and `nightfly`.

List them at runtime:

```ts
import { ThemeManager } from "@huyz0/ztui";

const tm = ThemeManager.getInstance();
tm.listThemes().map((t) => t.name);
```

## Switching the active theme

```ts
import { ThemeManager } from "@huyz0/ztui";

ThemeManager.getInstance().setTheme("tokyo-night");
```

The app subscribes to theme changes and re-renders the whole tree, so every
`$token` updates live. (An unknown name is ignored with a warning.)

## The live picker

Mount `<ThemePalette>` once near your app root for a built-in visual picker —
press **Ctrl+Alt+T** to open it, arrow through the palettes with a live preview,
Enter to apply:

```tsx
import { ThemePalette } from "@huyz0/ztui/react";

<Dock>
  <ThemePalette />        {/* Ctrl+Alt+T; override with toggleKey="…" */}
  …
</Dock>;
```

## Per-subtree themes

Set the `theme` prop on any widget to re-theme just that subtree — handy for a
preview pane or a callout in a different palette. Tokens in descendants resolve
against the nearest ancestor `theme`:

```tsx
<VBox theme="dracula">
  <Label style={{ color: "$primary" }}>themed independently of the app</Label>
</VBox>
```

## Registering a custom theme

Register a `Theme` (just a `name` and a `colors` map) and switch to it:

```ts
import { ThemeManager } from "@huyz0/ztui";

const tm = ThemeManager.getInstance();
tm.register({
  name: "brand",
  colors: {
    primary: "#7c5cff",
    secondary: "#22d3ee",
    background: "#0b0b12",
    foreground: "#e7e7ef",
    surface: "#15151f",
    panel: "#1d1d2a",
    accent: "#f0abfc",
    success: "#34d399",
    warning: "#fbbf24",
    error: "#fb7185",
    border: "#2a2a3a",
  },
});
tm.setTheme("brand");
```

Only the core tokens are required; anything you omit falls back sensibly. To
spin a variant off an existing palette, use `deriveTheme`:

```ts
import { deriveTheme, ThemeManager } from "@huyz0/ztui";

const tm = ThemeManager.getInstance();
const dimmer = deriveTheme(tm.getTheme("nord")!, "nord-dim", { adjustLightness: -8 });
tm.register(dimmer);
```
