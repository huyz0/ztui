# Changelog

All notable changes to ztui are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.7] - 2026-06-17

### Added

- Mouse pointer shapes: widgets can request a context-appropriate cursor via the
  `cursor` style (`"pointer"`, `"text"`, `"grab"`, `"not-allowed"`, the
  `*-resize` family, …, named after CSS). The App pushes the hovered widget's
  shape to the terminal over OSC 22, inheriting from the nearest ancestor that
  sets `cursor` and resetting to the default arrow on empty space and exit.
  Capability is probed at startup and stays off unless the terminal confirms
  support (kitty, foot, recent xterm; opt-in on Alacritty), so terminals without
  OSC 22 (Windows Terminal, VS Code, iTerm2) degrade silently. New public
  exports: `PointerShape`, `POINTER_SHAPES`, `isPointerShape`, and
  `TerminalCapabilities.pointerShapes`.
- Built-in widgets now carry a role-based default shape: buttons, checkboxes,
  switches, radios, toggle buttons, selects, sliders, menus, tabs, collapsibles,
  lists/trees, and any `onClick` widget show `pointer`; text inputs/textareas/the
  chat composer show `text`; a disabled interactive widget shows `not-allowed`;
  and resize splitters (in `SplitView`/`Workbench`, hence the IDE/workbench
  demos) show `ew-resize` or `ns-resize` matching their drag axis.
  An explicit `cursor` style overrides the default. Pointer shapes can be turned
  off app-wide via `new App(driver, { pointerShapes: false })` or the
  `app.pointerShapes` setter (default on); disabling at runtime resets the
  pointer to the terminal default. The shape can also vary *within* a widget via
  `Widget.cursorShapeAt(x, y)` — lists and trees keep the default arrow over
  their scrollbar gutter instead of the row `pointer`.

## [1.0.6] - 2026-06-17

### Fixed

- Sixel/iTerm2: a stray opaque cell ("black hole") no longer punches through a
  newly drawn image when switching between graphics-bearing screens (e.g. the
  protocols → images demo). On a graphics change these protocols now wipe the
  screen and re-emit the frame (as Kitty already did) instead of painting
  per-cell opaque rectangles, which could overpaint a freshly drawn image when
  the old and new images overlapped.

### Added

- Documentation page and gallery screenshot for the `ChatInput` widget.

### Changed

- Extracted the mouse hit-testing logic out of `App` into a standalone,
  unit-tested `core/hit-test` module (no behavior change).
- Replaced 30 `as any` casts in the render/dispatch core (`dom/widget`,
  `dom/dom`, `core/app`, `core/inspector`) with precise typed shapes.
- Raised test line coverage from ~92% to 95% with behavior-focused tests across
  the widgets, renderers, the canvas backend, and the terminal driver's
  capability-probe parsing.
- De-duplicated the row-indexed scroll math (wheel step, track-Y mapping, max
  scroll) into a shared `widgets/data/row-scroll` helper used by `ListView`,
  `SelectionList`, `Tree`, `RichLog`, `Table`, `TerminalView`, `Diff`, and
  `Traceback` (no behavior change).

## [1.0.4] - 2026-06-15

### Changed

- Reduced terminal idle CPU by batching caret and other paint-only cosmetic repaints onto a shared 10fps cadence, while keeping static focus styling and switching smooth caret to a hard blink by default.
- Reduced hover CPU in terminal sessions by adding visible-only hover-interest detection, runtime passive-hover mode switching, a 15Hz admitted move throttle, and hard dropping passive move events when hover tracking is disabled.
- Added live render/input/mouse diagnostics to the inspector state plus a reusable mouse-hover benchmark script for profiling Ghostty-style hover workloads.

### Fixed

- Hover behavior in debug/VTE coverage paths remains correct under the new runtime hover optimizations, and driver capability tests are now deterministic under the current terminal environment.

### Added

- `ChatInput` — a framework-agnostic chat composer for AI-agent UIs. It owns its
  own edit buffer (works with any state system, not just React), grows with
  content, and sends on Enter (Shift+Enter for a newline). Features: atomic
  inline **chips** (`fill`/`bracket` styles) with whole-unit selection, deletion,
  caret-skip, click-to-copy, and undoable accept-only auto-pilling; a generic
  **trigger registry** (a character → completion popup → text/chip/command, so
  slash-commands and @mentions are just data, not hardcoded paths); a
  keybinding/palette **command registry**; app-provided inline **ghost-text
  autocomplete** (dim suffix with a `→` marker, Right-at-EOL accept, Tab opt-in);
  edge-aware **history recall** (Up/Down at the first/last row); snapshot-based
  **undo/redo**; an **attachment strip** with removable pills; and an in-border
  **send/stop** affordance driven by a `busy` flag (purely an affordance —
  Enter/Esc always work). See `docs/chat-input-design.md`.

## [1.0.1] - 2026-06-14

### Added

- Markdown now renders GFM tables. They are borderless and color-delineated —
  whitespace-aligned columns (honoring `:--`/`--:`/`:-:` alignment), a bold
  accent header with a thin underline, and zebra-striped rows via a `$panel`
  background tint — so they stay readable in narrow panes without box chrome
  eating horizontal space.
- A copy-to-clipboard button on code blocks (`Syntax`) and Markdown. It sits in
  the content's top-right corner, copies the raw source on click, brightens with
  a `$panel` background pill on hover, and shows a brief `✓` acknowledgement.

### Changed

- Scrollable widgets now reserve a one-cell gutter for a visible scrollbar
  instead of painting the bar over the last row/column, so content (and overlay
  chrome) is never hidden beneath the scrollbar. Absolute children can opt into
  viewport-pinned (`position: fixed`-style) placement via `Widget.positionFixed`.

### Fixed

- The Markdown/Syntax copy button blends with its background on every terminal
  (it samples the cell behind it rather than relying on a theme token), fixing a
  stray dark square on terminals whose default background differs from the theme
  (e.g. Windows Terminal).

## [1.0.0] - 2026-06-14

First stable release.

### Added

- Declarative, React-based TUI framework with a custom reconciler over a widget
  DOM that lays out and renders into a grid of styled cells.
- Two backends from one widget tree: a terminal (ANSI diff) driver and a
  browser `<canvas>` driver, plus a headless `MockDriver`.
- ~60 built-in widgets (tables, trees, inputs, forms, markdown, diffs,
  sparklines, terminal view, workbench, and more).
- Form validation system (validators, per-field triggers, `<Form>`, shared/inline
  message modes) and a propagating `disabled` state.
- Inline graphics via Kitty / iTerm2 / Sixel with Unicode-block fallback, chosen
  from probed terminal capabilities.
- Animation engine (`Widget.animate`, easing, focus/attention breathing) honoring
  reduced-motion.
- Extension API: subclass `Widget` + `registerElement`, with one-call
  `hostComponent` registration; the widget layer is framework-agnostic.
- Debuggability surface for humans, CI, and AI agents: `renderBufferToText` /
  `renderBufferToHTML`, `MockDriver`, and a REST inspector (`startInspector`).
- Dual distribution: compiled JS + `.d.ts` for Node/bundlers, with a `bun`
  export condition serving TypeScript source to Bun.

### Security

- HTML render output (`renderBufferToHTML`) escapes hyperlink hrefs and
  scheme-checks them (only `http`/`https`/`mailto`/relative survive), and
  restricts color values to safe literals, preventing XSS from untrusted
  Markdown when the HTML render is viewed.
- `startInspector` binds to `127.0.0.1` by default (it has no auth and `POST
  /input` can drive the app); remote binding is an explicit opt-in.

[1.0.1]: https://github.com/huyz0/ztui/releases/tag/v1.0.1
[1.0.0]: https://github.com/huyz0/ztui/releases/tag/v1.0.0
