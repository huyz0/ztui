# Changelog

All notable changes to ztui are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/huyz0/ztui/releases/tag/v1.0.0
