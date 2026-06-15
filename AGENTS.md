# AGENTS.md

Orientation for AI agents on **ztui**. A router + invariants list; it does **not**
repeat the detail in [`.agents/skills/`](.agents/skills/) and [`docs/`](docs/). On
conflict, the skill/doc wins for its topic — fix the drift.

## What this is

A declarative **React-based TUI framework** for TypeScript/Bun. JSX → a custom
reconciler commits to a widget DOM → layout → a **2-D grid of styled cells**
(`ScreenBuffer`). A `Driver` presents that grid: the **terminal** driver diffs it
to ANSI; the **web** driver paints the same grid to a browser `<canvas>`. The cell
grid is the portable hand-off, so the *same* widgets run on both backends.

Traits to preserve:

- **Backend portability** — layout/widgets/cell model are terminal-agnostic;
  terminal specifics (ANSI, Sixel/Kitty, raw TTY) live only in `src/driver/*`.
- **AI-native inspectability** — DOM and buffer serialize to JSON/HTML/text;
  headless drivers (`MockDriver`, `VTEDriver`), a REST inspector, and a Playwright
  `WebInspector` let you *see* and assert on the UI. Use them instead of guessing.
- **Slim, opt-in packaging** — core plus `ztui/{react,markdown,syntax,mermaid}`;
  heavy deps are optional `peerDependencies`. Check the README before adding one.

Full mental model: [`docs/architecture.md`](docs/architecture.md).

## Invariants (don't break)

1. **Acyclic, downward-only imports.** `geometry → render → dom → layout → css →
   widgets` never import up (`core`, `react`); `widgets` imports no `driver`,
   `driver` no widget. Verify: `bunx madge --circular --extensions ts,tsx src`
   (must be 0). See the **architecture** skill.
2. **No terminal coupling outside the driver.** No escape sequences,
   `process.stdout/stdin`, or `graphicsProtocol` branching in `widgets/**` or
   `core/**`; widgets emit cells/`Segment`s, `App` uses the abstract `Driver`.
   `Style` is pure data — SGR lives in `render/ansi-style.ts`. Sole exception:
   `TerminalViewWidget` (sandboxes a parsed ANSI stream). `bun run review` guards this.
3. **Widget conventions** — set `this.defaultStyle` (never mutate `this.style`),
   call `super.render(buffer)` first; React wrappers are thin `hostComponent(...)`
   factories extending `ComponentProps`. See the **design** skill.
4. **Render code stays backend-agnostic** — operate on the cell grid, not ANSI;
   it must work on terminal *and* web/canvas.
5. **Keep the gates green** — new behavior needs tests; coverage is enforced.

## Commands

`.githooks/pre-commit` (auto-registered) runs the gate rows below in order and
blocks on failure; CI (`.github/workflows/ci.yml`) runs the same gates plus a
`build`. Run them before calling a task done:

| Step | Command | Notes |
|------|---------|-------|
| Lint | `bun run lint` / `lint:fix` | Biome. |
| Type-check | `bun run typecheck` | `tsc --noEmit`, strict. |
| Tests + coverage | `bun run test` | Vitest. **Use `vitest run`, never `bun test`** (shared process → false flakes). |
| E2E | `bun run test:e2e` | Spawns the real binary. |
| Arch | `bunx madge --circular --extensions ts,tsx src` | Stay at 0 cycles. |
| Leak guard | `bun run review` | Static guard: no driver/ANSI leak into `widgets`/`core`. |
| Demos | `bun run demo` / `demo:web` | One gallery for all examples (manual — not a gate). |

**Commits**: the `commit-msg` hook allows only `feat|fix|docs|test|chore` + optional
`(scope)` + lowercase description (e.g. `feat(layout): add grid gap`).
`refactor`/`style`/`perf` are rejected — use `chore`/`fix`. End with the
`Co-Authored-By` trailer; branch first before committing to `main`.

## Where to look (task → skill → doc)

Skills are the process source of truth; `docs/` are the deep-dives.

| Task | Skill | Doc |
|------|-------|-----|
| Files/imports/layers | `architecture` | [architecture.md](docs/architecture.md) |
| Widget or component / styling | `design` | [coding_standards.md](docs/coding_standards.md) |
| Code & tests (TDD, coverage) | `tdd` | [testing_standards.md](docs/testing_standards.md) |
| Debugging / inspector / TTY | `debug` | [diagnostics.md](docs/diagnostics.md) |
| Commits / branching / hooks | `git-workflow` | [git_best_practices.md](docs/git_best_practices.md) |
| Finishing / self-review | `code-review` | [code_review.md](docs/code_review.md) |
| Editing skills | `manage-skills` | — |

## Workflow

- **Read the matching skill before acting** — it already encodes the layer map,
  `defaultStyle` rule, commit regex, and coverage gates.
- **Lowest useful test layer** (unit > integration > e2e); use the `mountApp`
  harness ([`src/test/harness.tsx`](src/test/harness.tsx)), don't hand-roll a driver.
- **Minimal, in the right place** — reaching for an escape in a widget, a
  cross-layer import, or a copy-paste is the signal to add a `Driver` method,
  invert the dependency, or extract a helper instead.
- **Update docs/skills in the same change** — doc drift is a bug.

> `.oss/` is vendored third-party code (gitignored, own `AGENTS.md`s) — not ztui;
> these rules don't apply there.
