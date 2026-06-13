---
title: Widget Gallery
description: The built-in ztui widgets, each with a live-rendered screenshot, minimal usage, and a link to its runnable demo.
---

Every widget below is shown with a screenshot **generated from its gallery demo**
on the browser/canvas backend (via `bun run docs:screenshots`) — so the images
can't drift from the components. Each page links to the full runnable demo in the
repo.

ztui ships ~66 components across seven categories. This gallery is filling in
batch by batch; the remaining controls, layout, and media widgets land next.

## Data

- [Table](/ztui/widgets/table/) — virtualized, sortable data grid for huge row sets.
- [Tree](/ztui/widgets/tree/) — virtualized navigation/file tree.
- [List View](/ztui/widgets/list-view/) — a scrollable, selectable single-column list.
- [Selection List](/ztui/widgets/selection-list/) — a multi-select checklist.
- [Sparkline](/ztui/widgets/sparkline/) — compact inline trend chart.
- [Diff](/ztui/widgets/diff/) — unified/split text diff with syntax highlighting.
- [Rich Log](/ztui/widgets/rich-log/) — append-only, auto-scrolling log view.
- [Terminal View](/ztui/widgets/terminal-view/) — sandboxed ANSI terminal pane.

## Text & input

- [Markdown](/ztui/widgets/markdown/) — render (and stream) Markdown with highlighted code.
- [Rich Text](/ztui/widgets/rich-text/) — inline-markup styled text in one element.
- [Text Area](/ztui/widgets/text-area/) — multi-line editor with gutter and validation.
- [Form](/ztui/widgets/form/) — validating container that aggregates its fields.
- [Question / Answer](/ztui/widgets/question-answer/) — single/multi-choice prompt.

## Feedback

- [Status](/ztui/widgets/status/) — status dots, badges, and lists.
- [Waiting & Progress](/ztui/widgets/waiting/) — spinners, progress bars, waiting panels.

## Layout

- [Collapsible](/ztui/widgets/collapsible/) — a titled, toggleable disclosure section.
- [Tabs](/ztui/widgets/tabs/) — tabbed container showing one panel at a time.
- [Split View](/ztui/widgets/split-view/) — recursively splittable, resizable panes.
- [Overlays](/ztui/widgets/overlays/) — modal dialogs and floating panels.
- [Workbench](/ztui/widgets/workbench/) — VS Code-style dockable layout.

## Media

- [Image](/ztui/widgets/image/) — inline raster/SVG images with graceful fallback.
- [HeroIcon](/ztui/widgets/heroicon/) — Heroicons as crisp, theme-tinted vectors.
- [File Icon](/ztui/widgets/file-icon/) — VS Code-style Seti file-type icons.
