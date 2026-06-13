# Testing & Coverage Standards

This document describes the testing requirements, configuration setup, and coverage thresholds for the ZTUI codebase.

---

## 1. Core Principles & General Guidance

### 1.1 Test-First Methodology
The framework relies on a disciplined Test-Driven Development (TDD) cycle. Automated tests are not an afterthought; they specify and drive the API designs. Code changes must not be committed without corresponding unit or integration test coverage.

### 1.2 Side-Effect Isolation & Headless Sandboxing
All unit and integration tests must run safely in headless CI pipelines without access to real OS terminal streams or active TTY environments. Terminal input/output side-effects must be isolated using the memory-resident `MockDriver` to simulate drawing buffers and input loops.

### 1.3 Strict Teardown & Resource Cleanup
Since the framework binds process events and sets up async render loops, test instances must be cleaned up properly. Failing to tear down applications leads to memory leaks, socket address conflicts, and event listener pollution.

### 1.4 Test Taxonomy (Unit / Integration / E2E)
Tests are organized into three layers by how much of the system they exercise and where they live:

| Layer | Exercises | Driver | Location | Runner |
|---|---|---|---|---|
| **Unit** | One module's pure logic (geometry, layout, `parseDimension`, `ScreenBuffer`, rich-text engines, CSS resolver). | none | Colocated `*.test.ts(x)` beside the source. | `bun run test` |
| **Integration** | The wired pipeline — React → DOM → layout → `ScreenBuffer` → ANSI — driven in-process and parsed by an emulator. Includes single-widget render tests. | `VTEDriver` (`@xterm/headless`) via the `mountApp` harness. | Single-module → colocated; multi-module suites → `src/test/`. | `bun run test` |
| **E2E** | The real binary as a separate OS process: real `BunDriver`, raw stdin/stdout, alternate-screen, capability handling, and signal/exit lifecycle. | Real `BunDriver` (spawned with `bun run`). | `e2e/` (fixtures in `e2e/fixtures/`). | `bun run test:e2e` |

- **Rule**: Reach for the lowest layer that can prove the behavior. Only write an E2E test for things the in-process `VTEDriver` cannot exercise — alternate-screen entry/exit, cursor hide/show, mouse-tracking enablement and real SGR click routing, signal handling (SIGINT/SIGTERM exit codes), and real stdin→render round-trips.
- **Rule**: E2E tests run under their own config (`vitest.config.e2e.ts`), are **excluded from the coverage gate** (they have no meaningful `src` line coverage and are slower), and are kept deterministic by asserting on a reconstructed screen (real stdout piped through `@xterm/headless`) plus raw control-sequence checks.

---

## 2. Specific Rules & Requirements

### 2.1 Test Execution & Runner
- **Rule**: ZTUI uses **Vitest** for testing and **v8** for coverage collection. All tests are run via the default package scripts.
- **Rule**: Unit and single-module tests reside immediately alongside the code they test (e.g. `src/dom/dom.test.ts`, `src/widgets/controls/textarea.test.tsx`). Cross-module integration suites live in `src/test/`; end-to-end suites live in `e2e/`.
- **Rule**: Spin up the full App↔React↔driver pipeline with the shared `mountApp` harness (`src/test/harness.tsx`) — never hand-roll the `new VTEDriver`/`new App`/`render`/`run`/`sleep` dance. It returns `{ app, driver, screen, container, findById, settle, buffer, cellAt, text }` and auto-stops every app in an `afterEach`.

### 2.2 Coverage Thresholds & Gates
- **Rule**: Every code change **MUST** maintain or improve test coverage. Global thresholds configured in `vitest.config.ts` are strictly enforced by pre-commit hooks:
  - **Line Coverage**: $\ge 90\%$
  - **Function Coverage**: $\ge 90\%$
  - **Statement Coverage**: $\ge 88\%$
  - **Branch Coverage**: $\ge 70\%$
- **Rule**: Modules excluded from the coverage gate (see `vitest.config.ts`) fall into three groups, none of which carry meaningful unit-coverable logic:
  - **Re-export-only entry points & registries**: `src/core.ts`, `src/react.ts`, `src/markdown.ts`, `src/syntax.ts`, `src/mermaid.ts`, and the `register-*` modules.
  - **React/runtime boundaries**: `src/react/host-config.ts` (reconciler callbacks), `src/core/inspector.ts` (HTTP socket listener), `src/utils/sharp-render-sync.ts` (spawned subprocess).
  - **Browser-/bundler-only web code** (verified via Playwright with `bun run web:debug`, not the unit runner): `src/tools/web-inspector.ts`, `src/driver/web/canvas-bundle.ts`, `src/driver/web/canvas-client.ts`, `src/driver/web/dom.ts`.

### 2.3 Teardown & Async Handling Rules
- **Rule**: Always invoke `app.stop()` in `afterEach()` or at the end of each test case to unregister process event listeners and close mock driver buffers.
- **Rule**: React reconciler updates commit asynchronously. When asserting state changes, always wait for the updates to flush:
  ```typescript
  await new Promise((resolve) => setTimeout(resolve, 15));
  ```

---

## 3. Checklist & Examples

### Isolated Component Test Template
```tsx
import { afterEach, beforeEach, expect, test } from "vitest";
import { App, MockDriver } from "../core.ts";
import { renderBufferToText } from "../render/html-renderer.ts";
import { Label, render } from "../react.ts";

let app: App;

beforeEach(() => {
  // MockDriver is the memory-resident, headless Driver (no TTY).
  app = new App(new MockDriver(80, 24));
});

afterEach(() => {
  app.stop(); // CRITICAL: unbinds event listeners and releases App.instance
});

test("renders custom widget", async () => {
  render(<Label>Expected Text</Label>, app.activeScreen);
  app.run();

  // Wait for the React commit + microtask render-queue flush.
  await new Promise((resolve) => setTimeout(resolve, 15));

  // `app.buffer` is the composed cell grid; render it to plain text to assert.
  expect(renderBufferToText(app.buffer)).toContain("Expected Text");
});
```

> Most suites use the higher-level [`mountApp`](../src/test/harness.tsx) helper,
> which wraps this boilerplate and returns `{ text(), settle(), findById(), … }`.

### Quick Commands Checklist
- Run unit + integration tests with coverage: `bun run test`
- Run end-to-end tests (spawns real processes): `bun run test:e2e`

---

## 4. Cross-References

To maintain full compliance with ZTUI constraints, cross-reference these standards:
- **Architecture Blueprint**: [architecture.md](./architecture.md) (Layer boundary rules and dynamic registry)
- **Coding Standards**: [coding_standards.md](./coding_standards.md) (React wrappers, style coercion, and linting rules)
- **TDD Workflow**: [tdd_workflow.md](./tdd_workflow.md) (Red-green cycles and bugfixes)
- **Diagnostics & Recovery**: [diagnostics.md](./diagnostics.md) (Rest endpoints and process cleanup hooks)
- **Git Best Practices**: [git_best_practices.md](./git_best_practices.md) (Commit headers and pre-commit hooks)
- **Skill Lifecycle**: [skill_lifecycle.md](./skill_lifecycle.md) (Agent triggers and skill registrations)
- **Code Review**: [code_review.md](./code_review.md) (Self-critique checklists and templates)

