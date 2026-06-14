---
title: Architecture
description: How a ztui app flows from JSX to pixels — the widget DOM, the cell grid, and the two backends.
---

ztui separates *what to draw* from *how it reaches a screen*, which is what lets
one widget tree run in a terminal or a browser.

## The pipeline

```
JSX  →  React reconciler  →  Widget DOM  →  layout  →  ScreenBuffer (cell grid)  →  Driver
```

1. **JSX → reconciler.** A custom React reconciler (`@huyz0/ztui/react`) commits your
   components into a tree of `Widget` nodes — the framework's own DOM.
2. **Layout.** Each frame, the layout engine resolves every widget's region from
   its styles (sizing with `fr` / `%` / `auto`, docking, flex distribution).
3. **Render to cells.** Widgets paint into a `ScreenBuffer` — a 2-D grid of
   styled cells (character + colors + attributes). This grid is **backend-neutral**.
4. **Present.** A `Driver` takes the grid:
   - the **terminal** driver diffs it against the previous frame and writes the
     minimal ANSI update to stdout;
   - the **web** driver paints the same grid onto a hardware-accelerated
     `<canvas>`.

The cell grid is the **portable hand-off point** — everything above it is shared,
everything terminal-specific lives below it in the driver.

## Layers

The codebase is a strict, acyclic dependency graph (lower layers never import
higher ones):

| Layer | Responsibility |
| --- | --- |
| `geometry` | Pure primitives: `Size`, `Offset`, `Region`, `Spacing`. |
| `render` | The `ScreenBuffer` cell model, `Style` data model, `Segment`, rich-text engines, icon rasterization. |
| `dom` | `DOMNode` / `Widget` tree, the `Screen`, event targets. |
| `layout` | Box / Grid / Dock geometry solvers. |
| `css` | Stylesheet parsing + specificity cascade. |
| `widgets` | Concrete controls (Button, Input, Table, Tree, …). |
| `driver` | Terminal (`bun/`), headless (`mock/`), and browser (`web/`) backends. |
| `core` | The `App` loop, event routing, REST inspector. |
| `react` | The reconciler and JSX component wrappers. |

## AI-native inspectability

Because the DOM and the rendered buffer are fully serializable, ztui ships
headless drivers (`MockDriver`, `VTEDriver`), a REST inspector, and a Playwright
`WebInspector` that screenshots the canvas backend. Agents and CI can *see* and
assert on the UI with no human at a screen — the same machinery that generates
the screenshots in these docs.

## Going deeper

This is the high-level view. The full contributor-facing design — layer rules,
the portable vs. terminal-specific split, the render pipeline internals — lives in
[`docs/architecture.md`](https://github.com/huyz0/ztui/blob/main/docs/architecture.md)
in the repository.
