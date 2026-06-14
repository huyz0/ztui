# Contributing to ztui

Thanks for your interest in improving ztui!

## Development setup

ztui is developed with [Bun](https://bun.sh).

```bash
bun install
bun run demo        # open the widget gallery (terminal)
bun run demo:web    # open the gallery in a browser canvas
```

The first `bun install` configures the project's git hooks
(`core.hooksPath .githooks`) via the `prepare` script, so the same checks that
run in CI run before each commit.

## Quality gates

All of these must pass; CI enforces them on every PR:

```bash
bun run lint        # Biome
bun run typecheck   # tsc --noEmit
bun run build       # emit dist/ (JS + .d.ts)
bun run test        # Vitest (unit + integration, with coverage)
```

- Prefer adding or updating tests alongside any behavior change. The UI
  serializes to text, so most assertions are plain string checks — see the
  [Debugging & AI agents guide](https://huyz0.github.io/ztui/guides/debugging/).
- Match the style and comment density of the surrounding code.
- Commit messages follow Conventional Commits (`feat`, `fix`, `docs`, `test`,
  `chore`); the commit-msg hook enforces this.

## Architecture

The codebase is layered and acyclic (React → widget DOM → screen buffer →
driver). See the [Architecture guide](https://huyz0.github.io/ztui/guides/architecture/)
before making structural changes.
