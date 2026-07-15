# Changelog

All notable changes to ztui are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-07-15

### Added

- **`Combobox`** — a filterable text field with autocomplete suggestions in a
  popover; type to narrow, pick a suggestion or keep a custom value.
- **`DatePicker`** — a single-date field that opens a calendar popover
  (day/month/year navigation) and commits a plain `YYYY-MM-DD` value.
- **`buildFileTree`** — an I/O-free bridge from a plain directory listing
  (`FileEntry[]`) to `<Tree>`'s `TreeNode[]`, with per-extension icons and
  lazy-directory support.
- **Drag-to-reorder tabs** — `<TabContainer reorderable>` lets a tab header be
  dragged to a new position, with `onReorder` firing once the drag settles.
- **`TextArea` undo/redo** — `Ctrl+Z`/`Cmd+Z` and
  `Ctrl+Y`/`Ctrl+Shift+Z`/`Cmd+Shift+Z`, one history entry per edit action.
- **`GridLayout` configurable columns** — the column count is no longer
  hardcoded to 2.
- **WebP/AVIF support** in `Image` via the `sharp` fallback decoder.
- **`getAccessibleNode` overrides** on `Slider`, `Select`, `Tree`, and `Table`.

### Fixed

This release folds in roughly 100 targeted bug fixes from a multi-round
review pass across the layout engine, CSS resolver, focus/overlay/hit-test
system, terminal input drivers (bun + web), and most data/control widgets.
Highlights:

- **Terminal input drivers**: a Windows Terminal/ConPTY regression that
  stopped all mouse reporting after any-motion tracking was toggled off (the
  fix that prompted this release); Ctrl+C safety-exit dropped when coalesced
  with other bytes in one stdin chunk; escape sequences split across a chunk
  boundary misparsed as `Alt+key`; a stuck `buttonDown` after a lost SGR
  release turning ordinary hover into phantom drags; horizontal wheel tilt
  misreported as vertical scroll (both drivers); web driver drag events
  always reporting the left button regardless of which was held.
- **Focus, overlays, and hit-testing**: overlapping siblings/overlays at
  equal z-index resolved to the wrong (bottom/oldest) one instead of the
  topmost; a layer's key interceptor losing precedence to clipboard
  shortcuts; a dismissed modal leaving a stale drag-target reference; tab
  order following paint (z-index) order instead of document order.
- **Layout**: `flexWrap`, a `BoxLayout` shrink-phase rounding overflow, a
  `GridLayout` remainder gap on uneven division, a `DockLayout` overflow past
  its container, and `Widget.measure()` ignoring a container's own
  border/padding when measuring children.
- **CSS resolver**: comma-separated grouped selectors and chained
  pseudo-classes were silently dropped or matched unconditionally; `$var`
  alias chains and named/`rgb()` colors weren't resolved in some fallback
  paths; a self-referential alias could recurse forever.
- **Data widgets**: `Table`/`Tree`/`ListView` grouped-mode row indexing,
  column-width sampling, and horizontal-scroll bounds; `Select`/`Combobox`
  overlay positioning, filtering, and highlighted-index clamping; `Tree`
  selection stranded at `-1` after collapsing a selected node's ancestor;
  `ListView`'s collapsed-group seeding never re-running for a swapped
  dataset.
- **Rendering**: wide-glyph continuation cells left stale after a reused
  cell; `AnsiTerminal` overflow at the last column; `renderBufferToHTML`
  dropping `dim` styling; canvas glyph/box-drawing draws off the same pixel
  grid as background fills on non-1x DPR.
- **Misc widget correctness**: `Slider` step `0` producing `NaN`;
  `RadioGroup`/`Select`/`Combobox` hover/selection desyncs; `Toast`/`ToastHost`
  `maxVisible` edge cases; `Workbench` resize unbounded by its container;
  `SplitView` stale-tree/state-update ordering bugs; `DevTools` tree panel
  not refreshing on live mutation; hotkeys registered on `Tab`/`Ctrl+C`
  permanently unreachable.

## [1.1.2] - 2026-07-13

### Fixed

- **`flexGrow` spacers collapsing to 0 on overflow.** A row/column with a
  `flexGrow` spacer between two fixed/auto-sized siblings would silently clip
  the trailing sibling instead of the spacer shrinking to make room, once the
  siblings' combined size exceeded the container. `BoxLayout` now supports an
  opt-in `flexShrink` style prop (default `0`, off — back-compat): siblings
  that set it shrink proportionally, down to their `minWidth`/`minHeight`,
  before a `flexGrow` sibling is clamped to zero.
- **`Widget.measure()` ignored a container's own border/padding/explicit
  size when measuring its children.** Children were always measured against
  the space offered to their parent, not the parent's real content box, so an
  `"auto"`-sized child could measure itself larger than the container it
  actually ends up in and silently overflow (clipped by the default
  `overflowX: "hidden"`). Children are now measured against the parent's
  resolved content box.
- **`GridLayout` left a blank strip on the right/bottom edge** whenever the
  container's width/height didn't divide evenly by the column/row count
  (floor division dropped the remainder). The remainder is now distributed
  across the first N columns/rows so the grid fills its content box exactly.
- **`DockLayout` let an over-committed fixed-size dock overflow its
  container** and overlap whatever came after it. A docked child's
  height/width is now clamped to the space actually remaining.

### Added

- **`flexWrap: "wrap"`** on `BoxLayout` containers — children that overflow
  the main axis wrap onto a new line/column (stacked along the cross axis)
  instead of overflowing or relying solely on `flexShrink`.

## [1.1.1] - 2026-07-01

### Fixed

- **Box title truncation** — an overlong title on a box's top border kept its
  leading `╭─ ` but lost the trailing space (` ─╮` collapsed to `…╮`), making the
  truncated title look shoved to the right. The text is now budgeted for the two
  spaces it's wrapped in, so a truncated title stays symmetric.

### Performance

- **Syntax highlighting is memoized.** `Syntax.highlight` caches its Prism
  tokenization by `(theme, language, code)`; the `Syntax`, `Diff` and `Traceback`
  widgets previously re-tokenized the same code on every full frame (a ~120-line
  file measured ~2.1 ms uncached vs ~10 µs cached).
- **Text widgets stop recomputing per frame.** `RichText` caches its parsed
  markup and laid-out display rows; `Label` caches its wrapped rows; `RichText`,
  `Syntax` and `Mermaid` reuse one base paint `Style` across frames (via
  `Widget.cachedStyle`) so unchanged cells hit the render diff's identity fast
  path; the Mermaid ASCII-fallback layout is cached by diagram source. On the
  text-heavy profiler demo the redundant-frame measure phase dropped ~78%.

## [1.1.0] - 2026-06-30

### Added

- **`@huyz0/ztui/testing`** — the framework's own test harness, made public so
  apps can test their ztui UIs the same way. Runner-agnostic (no test framework
  imported): `mountApp(ui, opts?)` renders into a real `App` on a headless
  `VTEDriver` and returns `text()` / `findById` / `cellAt` / `settle` / `driver`;
  drive input with `driver.emit("key" | "mouse", …)`. `cleanupMountedApps()` (call
  from your runner's `afterEach`), `waitFor`, `flush`, and `mountTestApp` round it
  out. The repo's internal harness now re-exports this entry, so it dogfoods
  exactly what ships. See the new Testing guide.
- **DevTools** — a React-DevTools-style inspector (`<DevTools>`): a live
  widget-tree pane, a per-node detail pane (geometry, flags, resolved style), and
  a render-profiler strip (scoped-vs-full frame, widgets rendered, bytes, render
  reasons) from `App.getLastFrame()`. Backed by a small in-process data layer
  (`serializeDevTree` / `resolveDevNode` / `widgetDetail`) that complements the
  HTTP `startInspector()` backend. (Phase 1 of the DevTools plan in
  `docs/devtools-plan.md`.) **Phase 1.5** adds on-screen highlight
  (`<DevToolsHighlight>` boxes the selected widget) and a **pick mode** (`pick`)
  that selects the widget under the pointer as you hover the app. The in-app
  highlight is a pointer-transparent, full-screen overlay that **tints the
  inspected widget's cells** at absolute screen coordinates (keeping their glyphs)
  — backed by a new `Widget.pointerTransparent` flag (CSS `pointer-events: none`).
  **Phase 2**
  adds a **browser DevTools panel** served by `startInspector()` at
  `GET /devtools` — a self-contained page (no build step) that polls `/render`,
  `/dom`, and `/state` to show a live screen mirror, the interactive widget tree,
  a per-node detail pane, and a state/profiler header; clicking a node boxes it
  on the mirror. **Phase 3** deepens the profiler: `/state` now includes the
  latest frame summary, the browser panel shows a recent-frames sparkline and a
  **⚡ highlight-updates** toggle that flashes the damaged row band on each scoped
  frame, and the in-app `<DevTools>` profiler strip gains a frame sparkline.
- **Agent example** — a flagship `examples/agent_demo.tsx`: a miniature terminal
  coding agent built entirely from the Agent Kit. The whole screen is one
  `Conversation` whose transcript mixes `ChatBubble`/`TaskTree`/`Reasoning`/
  `ToolRender`/`FileChip`/`StreamingText`; the composer carries an `@` file
  mention and a `/model` command that opens the `ModelPicker` in a `Popover`
  (also reachable from a model badge in the conversation's `hintTrailing` slot),
  and a compact `UsageMeter` sits in the footer.
- **`focusOnClick` containers** — set `focusOnClick` on any container (`Box`,
  `VBox`/`HBox`, `Panel`, `Form`, …) and a click on its chrome (border, padding,
  or any non-focusable child) moves focus to its first focusable descendant — so
  clicking a form/panel hands focus to its first field. `ApprovalPrompt` enables
  it (tied to `autoFocus`), so clicking anywhere in a permission gate focuses its
  action row.
- **`ButtonGroup`** — a roving-focus toolbar around `Button` children: arrow keys
  (`←`/`→`/`↑`/`↓`, `Home`/`End`) move focus between the buttons and the group is
  a single `Tab` stop, with disabled buttons skipped. Each child stays a real
  `Button`, so `onClick`, the focus glow, and `formAction` work natively — a group
  of `formAction` buttons inside a `<Form>` is an arrow-navigable actions row that
  still submits/resets on Enter. The Agent Kit's `ApprovalPrompt` now uses it, so
  its Allow / Deny / Always buttons are one Tab stop with arrow navigation, and the
  gate grabs focus when it appears (`autoFocus`, on by default) so the keyboard is
  ready without Tabbing in.
- **Agent Kit** — a cohesive set of React components for building terminal AI
  agents. `Transcript` (a tail-following scrollback), `ChatBubble` (role-accented
  message bubbles with per-role tints), `Reasoning` (a collapsible "thinking"
  block with a live spinner), `StreamingText` (text with a blinking caret),
  `ToolCall` and the `ToolRender` framework (a per-tool renderer registry with
  built-in Bash/Edit/Write renderers composing `Syntax`/`Diff`/`RichLog`),
  `ApprovalPrompt` (single- and batch-tool permission gates with pattern matching
  and a custom-pattern field), `TodoList`, and `UsageMeter` (turn/session token
  usage, prompt-cache hit/creation ratios, cost, and a context-window bar, with a
  click-to-expand popover in compact mode). Plus general `Chip`/`Pill` tokens and
  an agent `FileChip` for clickable citations.
- **`TaskTree`** — a hierarchical sibling of `TodoList` for nested agent plans:
  the same status glyphs (`○`/`◐`/`✔`/`✗`, in-progress emphasised, finished
  struck through) with sub-tasks drawn under dimmed `├─`/`└─` tree connectors,
  and a `title` heading whose `done/total` count spans the whole tree.
- **`Conversation`** — the agent chat shell that ties the kit together: a
  tail-following `Transcript` of turns (children) with a docked `ChatInput`
  composer beneath it. It owns the layout and the submit / interrupt / busy /
  hint-line wiring (no manual hint state or spacer rows), with optional
  `header`/`footer` slots and a `readOnly` mode for archived transcripts. Stateless
  by design — the app keeps the message list and busy flag. The bottom hint row
  also takes `hintLeading` / `hintTrailing` slots (status glyph on the left, a
  model badge or `UsageMeter` on the right of the contextual hints).
- **`ModelPicker`** — a filterable table list for choosing an LLM: each row shows
  the provider, name, a cost multiplier badge (coloured by magnitude, or a custom
  string), a reasoning icon, and a local/remote icon (icons, not text). Type to
  filter; arrow + Enter to choose. Columns appear only when a field is present,
  and `extraColumns` appends your own.
- **`Input` Enter/Escape callbacks** — `onSubmit(value)` fires on Enter and
  `onDismiss()` on Escape, so an inline field can submit or cancel without
  overriding the editing handler.
- **Markdown word-wrap** — flowing prose (paragraphs, headings, list and
  blockquote bodies) now wraps to the viewport width instead of overflowing into
  a horizontal scroll, so long chat-bubble messages no longer clip. On by
  default; pass `wrap={false}` to keep long lines on one row. `RichText` gained a
  `wrap` flag (with a `wrapWidthHint`) backing this, and the styled word-wrapper
  is shared with `RichLog`.
- **`Label`/`StreamingText` word-wrap** — `Label` gained an opt-in `wrap` prop
  that reflows plain text across rows instead of clipping a long line, and
  `StreamingText` uses it so a long streaming reply wraps to the bubble width
  (the blinking caret still trails the text).
- **`Markdown trimTrailingMargin`** — drops the final block's bottom margin so
  the text ends flush (no trailing blank row) inside an accent-barred container.
- **Tail-following scrollables** — `followTail` pins a scrollable to the bottom
  as content grows until the user scrolls up (and re-pins at the bottom); exposes
  `scrollToBottom()` / `isAtBottom()`.
- **Word/line mouse selection** — double-click selects the word under the
  pointer and triple-click selects the whole line (or the entire field, for
  single-line inputs), matching desktop-editor muscle memory.
- **Heavier and per-side borders** — a full-cell block border weight plus
  independent per-side border styling, used for chat-bubble accent bars and the
  toast level bar.
- **Frame profiler** — a phase-attributed render profiler (`bun run profile`)
  that splits each frame into `restyle → measure → layout → render → diff →
  write` and tracks redundant frames and emitted bytes, for diagnosing render
  cost.

### Changed

- **Much smaller per-frame terminal output.** The diff now emits only the
  minimal SGR transitions between cells, sticky/relative cursor moves, scroll-
  region shifts instead of re-emitting moved rows, `REP` run-compression and
  `EL` tail-clears where the terminal supports them — and skips ANSI encoding
  entirely for backends (the web canvas) that re-present the cell grid directly.
- **Scoped repaints.** Key, mouse, and control-driven changes now repaint only
  the affected widget's subtree (geometry-verified) instead of the whole screen,
  and background overdraw is skipped where a widget inherits its parent's fill —
  cutting redundant cell writes and paint-style recomputation across frames.

### Fixed

- **Icons no longer print as garbage on REP-capable terminals (e.g. Windows
  Terminal).** The REP run-compression added for plain text was also applied to
  icon/image cells, whose value is a raw graphics sequence (a sixel DCS); a `REP`
  escape injected into the middle of that sequence aborted the DCS and printed
  the payload as on-screen text (and corrupted icon redraws on click — the
  Workbench/IDE rail, the HeroIcon gallery). Run-compression now skips any
  content that contains an escape sequence, so graphics emit verbatim.
- Windows Terminal is no longer assumed to support sixel from its env name; it
  (like any terminal) gets sixel only when its DA1 probe reports attribute 4. A
  new `ZTUI_NO_GRAPHICS` environment variable forces text/glyph icon fallback on
  any terminal that mis-renders the graphics protocols.
- Blockquote lines in streamed Markdown now select correctly (multi-line
  `RichText`).
- Pointer-driven focus no longer scrolls the viewport.
- Clicking a `GalleryView` cell now focuses it so the keyboard takes over.

## [1.0.8] - 2026-06-20

### Added

- **`GalleryView`** — a responsive, scrollable grid of arbitrary items with 2D
  keyboard navigation (`←→`/`↑↓`, `PgUp`/`PgDn`/`Home`/`End`), mouse wheel and a
  draggable scrollbar, and a **column count that flows from the container width**
  and reflows on resize. You render each cell with `renderItem`; selection is
  reported through `onSelect`/`onActivate`, and the cursor is scrolled into view.
  New exports: `GalleryView`, `GalleryViewProps`, `GalleryItemContext`.
- **Collapsible grouped rows for `Table` and `ListView`** — pass `groups`
  (`RowGroup[]`) instead of flat data to render sections, each introduced by a
  non-interactive title row with an item count. The cursor and clicks skip the
  titles; clicking a title (or `←`/`→` on a `ListView` row) collapses/expands the
  group, reported via `onToggleGroup`. New exports: `RowGroup`, `GroupedRow`.
  (Grouped tables render text columns — sorting and `render` cells stay flat-only.)
- **`ThemePalette` is now a scrollable card grid** — every theme renders as a
  card painted in its own colors (palette swatches plus a live example),
  navigable in 2D. New `value`/`defaultValue` props make the active theme a
  controlled binding (pair with `onSelect`) so the choice can be persisted and
  restored. Enter/click apply a theme but keep the picker open so it can be seen
  first; Esc closes.

### Changed

- **`ThemePalette`'s default toggle key is now `Ctrl+T`** (was `Ctrl+Alt+T`) — a
  single cross-platform binding that reaches the app on every terminal, where
  `Ctrl+Alt+<letter>` collides with OS shortcuts and `F9` isn't delivered by some
  terminals. Override with `toggleKey` as before.

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
