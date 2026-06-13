---
name: ci-doctor
description: >-
  Diagnose and fix failing GitHub Actions CI/CD runs autonomously, and keep
  action versions current against live GitHub (not training-time memory). Use
  this whenever a workflow/build/deploy is red or you just pushed and want to
  confirm CI passed — phrases like "the build is failing", "CI is red", "why did
  the workflow fail", "the deploy didn't work", "check the GitHub Actions run",
  "did my push pass CI", or "are we using the latest actions". Use it BEFORE
  guessing at a CI failure from the YAML alone: it pulls the real failed-step
  logs so you fix the actual error. Also use before adding or bumping any
  `uses: owner/repo@vN` action, since the latest major is often newer than you
  remember.
---

# CI Doctor

Fix red CI by reading what actually failed, not by guessing from the workflow
file. An LLM's instinct is to eyeball the YAML and theorize; the logs almost
always tell you the real cause in their last 20 lines. This skill gives you two
Bun scripts plus a triage procedure so you can close the loop — diagnose, fix,
push, and confirm green — without a human relaying screenshots from the Actions
tab.

Two ideas drive everything here:

1. **Read the failure, then fix it.** Pull the failed-step logs first. The fix
   follows from the error class (permissions vs. lockfile vs. type error vs.
   infra), and those classes have known remedies.
2. **Ask GitHub for versions; don't trust memory.** Your training data is stale
   the moment a maintainer cuts a release. Before pinning or bumping an action,
   resolve the real latest from the API.

## Scripts

Both need the `gh` CLI authenticated (`gh auth status`). Run them with Bun from
the repo root. Paths below assume this skill's directory; adjust to wherever it
lives.

### `scripts/check-run.ts` — what failed and why

```bash
bun .agents/skills/ci-doctor/scripts/check-run.ts            # latest run, current branch
bun .agents/skills/ci-doctor/scripts/check-run.ts --watch    # poll until it finishes, then report
bun .agents/skills/ci-doctor/scripts/check-run.ts --workflow docs.yml
bun .agents/skills/ci-doctor/scripts/check-run.ts --run 123456789
bun .agents/skills/ci-doctor/scripts/check-run.ts --limit 5  # list recent runs
```

It prints the run's per-job status and, for failures, the **failed-step logs**
(trimmed to the useful tail) plus a first-pass diagnosis from known signatures.
The diagnosis is a hint, not gospel — always read the logs it shows.

### `scripts/audit-actions.ts` — are the actions current?

```bash
bun .agents/skills/ci-doctor/scripts/audit-actions.ts        # report outdated actions
bun .agents/skills/ci-doctor/scripts/audit-actions.ts --fix  # bump to latest major tag
bun .agents/skills/ci-doctor/scripts/audit-actions.ts --json # machine-readable
```

It scans `.github/workflows` (and `.github/actions`), and for each
`uses: owner/repo@ref` asks the GitHub API for the latest release and moving
major tag, flagging anything behind. `--fix` rewrites `@v3` → `@v4` etc. **Major
bumps can break** — read the action's release notes, then verify with a real run
(see below), don't just trust a green local build.

## Triage procedure

1. **Get the status.** `check-run.ts` (add `--watch` if a run is still going, or
   `--workflow <file>` to target one). If it's green, you're done.
2. **Read the failed-step logs** it prints. The real error is almost always in
   the last lines of the failing step. Resist diagnosing from the YAML before
   you've read the log.
3. **Classify the failure** (see taxonomy) and apply the matching fix. Separate
   *which job* failed from *which step* — a failing `deploy` job after a green
   `build` job is usually config/permissions, not your code.
4. **Reproduce locally when it's a code/test/type failure.** If it reproduces,
   fix and confirm locally first. If it only fails in CI, suspect the
   environment (see "passes locally, fails in CI").
5. **Verify on the remote.** Local green ≠ CI green. Push (or `gh run rerun
   <id>`), then `check-run.ts --watch` and confirm the conclusion is `success`.
   Do not report the failure fixed until the remote run is green.

## Failure taxonomy

These are the classes `check-run.ts` recognizes, with the why behind each fix.

- **Pages not enabled** — `deploy-pages` 404s with "Ensure GitHub Pages has been
  enabled". Pages publishing is off until someone turns it on. Enable it with
  Actions as the source via the API (needs repo admin):
  `gh api repos/{owner}/{repo}/pages -X POST -f build_type=workflow`. Or make the
  workflow self-enabling with an `actions/configure-pages@v5` step and
  `enablement: true` (plus `pages: write` permission). The hand path is Settings
  → Pages → Source: GitHub Actions.
- **Insufficient token permissions** — "Resource not accessible by integration",
  403. The default `GITHUB_TOKEN` is least-privilege. Add a `permissions:` block
  granting exactly what the job needs (`contents: write`, `pages: write`,
  `id-token: write`, `packages: write`, …) at job or workflow scope.
- **Lockfile drift** — `--frozen-lockfile` / "lockfile had changes". The
  committed lockfile doesn't match the manifest, so CI refuses to silently
  resolve. Re-install locally to regenerate the lockfile, commit it, push. (Don't
  drop `--frozen-lockfile` — it's catching a real drift.)
- **Deprecated action / runtime** — "automatically failed because it uses a
  deprecated version". Run `audit-actions.ts` and bump; check the changelog for
  renamed inputs or behavior changes.
- **Missing dependency / unresolved import** — "Cannot find module", "Cannot find
  type definition". The package isn't installed in CI. Common causes: it's in the
  wrong `package.json`, the install step runs in the wrong `working-directory`, or
  a tool reads a `tsconfig` whose deps live in a sibling package that CI didn't
  install. Install where the tool actually resolves from.
- **TypeScript type error** — `error TS####`. Reproduce with the same tsconfig
  and fix the types; CI is stricter only if it uses a different config.
- **Test failure** — `N failed`, `AssertionError`. Reproduce locally; if green
  locally, see below.
- **Network / transient** — timeouts, 429, ECONNRESET. Re-run once
  (`gh run rerun <id>`); if it recurs, add caching/retries.

### Passes locally, fails in CI

When a test or build is green on your machine but red in CI, the difference is
the environment, not the code. Usual suspects: timezone/locale, case-sensitive
filesystem (Linux CI vs. macOS), missing display for headless/browser tests,
higher parallelism exposing a race, no network access, or an uncommitted file
your machine has but the runner doesn't. Match the runner: same OS, same Node/Bun
version, clean checkout.

## Keeping actions current — why this matters

When you write or edit a workflow, do **not** fill in `@v4` from memory. By the
time you read this, the latest major may be higher, and using a deprecated major
is itself a CI failure class. Run `audit-actions.ts` before committing workflow
changes, and prefer the moving major tag (`@v4`) for first-party actions —
they're stable within a major and get security patches without a manual bump.
For third-party actions where supply-chain risk matters, pin to a full SHA and
update it deliberately (the audit reports SHA-pinned actions but won't rewrite
them, since bumping a SHA needs the new commit for the tag).

## Definition of done

CI is fixed when the **remote** run's conclusion is `success` — confirmed with
`check-run.ts --watch`, not inferred from a local build. If a fix needs a setting
only a repo admin can change (Pages, environments, secrets), make the change via
`gh` if you have the scope, otherwise state exactly what the human must toggle
and where.
