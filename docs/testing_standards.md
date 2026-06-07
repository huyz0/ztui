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

---

## 2. Specific Rules & Requirements

### 2.1 Test Execution & Runner
- **Rule**: ZTUI uses **Vitest** for testing and **v8** for coverage collection. All tests are run via the default package scripts.
- **Rule**: Test files must reside immediately alongside the code they test (e.g. `src/dom/dom.test.ts` for files in `src/dom/`).
- **Rule**: Use React component integration tests inside `.tsx` test files (such as `src/debug/debug.test.tsx`) to assert reconciler mutations, JSX tags, and layouts.

### 2.2 Coverage Thresholds & Gates
- **Rule**: Every code change **MUST** maintain or improve test coverage. Global thresholds configured in `vitest.config.ts` are strictly enforced by pre-commit hooks:
  - **Statement Coverage**: $\ge 90\%$
  - **Line Coverage**: $\ge 90\%$
  - **Function Coverage**: $\ge 90\%$
  - **Branch Coverage**: $\ge 80\%$
- **Rule**: The following system-boundary modules are excluded from code coverage checks due to direct hardware or environment bindings:
  - `src/driver/bun-driver.ts` (Requires active TTY streams)
  - `src/react/host-config.ts` (React-reconciler callback bindings)
  - `src/core/inspector.ts` (Spawns HTTP socket listeners)

### 2.3 Teardown & Async Handling Rules
- **Rule**: Always invoke `app.stop()` in `afterEach()` or at the end of each test case to unregister process event listeners and close mock driver buffers.
- **Rule**: React reconciler updates commit asynchronously. When asserting state changes, always wait for the updates to flush:
  ```typescript
  await new Promise((resolve) => setTimeout(resolve, 15));
  ```

---

## 3. Checklist & Examples

### Isolated Component Test Template
```typescript
import { expect, test, beforeEach, afterEach } from "vitest";
import { App } from "../core/app.ts";
import { MockDriver } from "../driver/mock-driver.ts";

let app: App;
let driver: MockDriver;

beforeEach(() => {
  driver = new MockDriver(80, 24);
  app = new App({ driver });
  app.start();
});

afterEach(() => {
  app.stop(); // CRITICAL: unbind event listeners
});

test("renders custom widget", async () => {
  // Trigger rendering updates
  app.requestRender();
  
  // Wait for async reconciler flush
  await new Promise((resolve) => setTimeout(resolve, 15));
  
  expect(driver.getBufferAsString()).toContain("Expected Text");
});
```

### Quick Commands Checklist
- Run tests: `bun run test`
- Run coverage verification: `bun run test --coverage`

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

