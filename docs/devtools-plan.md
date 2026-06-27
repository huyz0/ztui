# ztui DevTools — Plan

A "React DevTools" for ztui: inspect the live widget tree, a selected widget's
style/geometry/state, highlight it on screen, and profile renders. Works for the
terminal and web-canvas backends.

## Reuse (already built)

- **`src/core/inspector.ts` `startInspector()`** — HTTP server exposing `/tree`,
  `/dom` (serialized tree: tagName/id/classes/visible/focusable/region/style),
  `/state` (focused + hovered widget, render-reason stats), `/render` (HTML),
  `/screenshot`, `/log`, `POST /input`. The inspection + RPC backend.
- **Frame profiler** — `frameProfiler` + `App.getLastFrame()` → `FrameSummary`
  (phase split restyle→measure→layout→render→diff→write, full vs scoped, damage
  band, `widgetsRendered`, bytes, render reasons) + `framePipelineRunCount`.
- **`renderBufferToHTML`** — live HTML mirror of the screen for a browser panel.
- Widget `describe()`, `region`/`prevRegion`, `computedStyle`, focus/hover.

## Mapping to React DevTools

| React DevTools | ztui |
|---|---|
| Component tree | Widget tree (live) |
| Props/state | computed+raw style, geometry, flags, layout, control value |
| Inspect/highlight | box over a widget's `region` + reverse "pick" mode (hover→select) |
| Profiler / highlight updates | `FrameSummary` timeline; flash the damage band |
| Search | filter tree by tag/id/text |

## Architecture: two frontends, one protocol

Harden the inspector into a versioned protocol (add a WebSocket pushing tree-diffs
+ frame summaries), feeding:

1. **In-app overlay panel** (built in ztui, dogfooded) — hotkey-toggled side panel:
   tree + detail + on-screen highlight + pick mode + compact profiler. No external
   deps, any terminal. **Highest ROI; build first.**
2. **Browser DevTools panel** (web) — connects to the inspector WS, mirrors the
   screen + interactive tree + profiler flamegraph. Aligns with the web-canvas
   backend and the `ztui serve` moonshot.

## Phasing

- **Phase 0 — data layer / protocol**: typed in-process tree serializer +
  per-node detail (computedStyle, measured size, flags); later a WS channel
  (tree-diff + frame summaries) + `select`/`highlight`/`pick` endpoints.
- **Phase 1 — in-app overlay** (`<DevTools>`): `Tree` + detail + profiler strip,
  hotkey toggle, tree↔highlight, pick mode.
- **Phase 2 — browser panel**: a docs-site route (or standalone) on the Phase-0
  protocol.
- **Phase 3 — profiler depth**: record/replay timelines, highlight-updates
  overlay, commit list with reasons, regression vs baseline (ties into
  `bun run profile`).

## Decisions / risks

- Overlay first (no infra); browser later.
- Don't perturb the inspected tree: render the overlay in a dedicated layer
  excluded from inspection; stop the profiler counting its own frames.
- Read-only first; style/prop editing later via a mutate endpoint.
- Package behind a `ztui/devtools` entry so it tree-shakes out of production.
