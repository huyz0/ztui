# Diagnostics & Remote Inspection

This document describes the diagnostic principles, REST Inspector endpoints, and terminal state recovery rules for the ZTUI framework.

---

## 1. Core Principles & General Guidance

### 1.1 Headless Inspectability
The framework must support runtime introspection and debugging without requiring an active standard terminal attachment. This allows the layout tree and drawn buffers to be verified programmatically in CI pipelines or remote headless environments.

### 1.2 Console State Recovery & Process Safety
Terminal modifications (such as enabling raw stdin mode, hiding the cursor, and rendering alternate screen buffers) must be treated as critical system resources. In the event of a normal exit, SIGINT, or SIGTERM signal, the console raw state must be deterministically restored to its original parameters to prevent corrupting the host shell window.

### 1.3 Geometry Boundary Collapsing
Grid border lines consume space. When planning element sizes, developers must account for border overhead to prevent viewport collapsing and clipping anomalies.

---

## 2. Specific Rules & Requirements

### 2.1 Remote REST Inspector (endpoints in `src/core/inspector.ts`)
- **Rule**: The inspector server runs locally (default port: `8000`) to expose app state and accept input simulation.
- **Rule**: **JSON DOM Tree Structure (`GET /dom`)** MUST return coordinates, resolved style configurations, value properties, and focus states.
- **Rule**: **HTML Render Output (`GET /render`)** MUST return a raw HTML string mapping ScreenBuffer cell formatting to CSS styles.
- **Rule**: **Input Simulation (`POST /input`)** MUST accept mouse or keyboard JSON payload structures and inject them directly into the driver event queue.

### 2.2 Terminal Recovery & Layout Borders
- **Rule**: Concrete TTY drivers MUST listen for `exit`, `SIGINT`, and `SIGTERM` signals and cleanly unbind/restore raw-mode streams on termination.
- **Rule**: These TTY signal handlers MUST be cleanly unregistered inside the driver's `stop()` method to prevent memory leaks.
- **Rule**: Borders consume exactly **2 vertical cells**. If a bordered widget's height is resolved to `<= 2`, the viewport content height collapses to `0`, clipping all text rendering.
- **Rule**: Bordered widgets (e.g. Button, Input) MUST be configured with a default height or min-height of at least **3**.

---

## 3. Checklist & Examples

### Starting/Stopping Inspector Server
```typescript
import { startInspector } from "./core/inspector.ts";
const inspector = startInspector(app, 8000);

// Stop server inside teardown blocks
inspector.stop();
```

### Inspector Endpoint Payloads
- **Input Key Simulation (`POST /input`)**:
  ```json
  {
    "type": "key",
    "key": "enter",
    "name": "enter",
    "ctrl": false,
    "shift": false,
    "meta": false
  }
  ```
- **Input Mouse Simulation (`POST /input`)**:
  ```json
  {
    "type": "mouse",
    "x": 10,
    "y": 5,
    "action": "press",
    "button": "left"
  }
  ```

---

## 4. Cross-References

To maintain full compliance with ZTUI constraints, cross-reference these standards:
- **Architecture Blueprint**: [architecture.md](./architecture.md) (Layer boundary rules and dynamic registry)
- **Coding Standards**: [coding_standards.md](./coding_standards.md) (React wrappers, style coercion, and linting rules)
- **Testing & Coverage**: [testing_standards.md](./testing_standards.md) (Vitest configurations and coverage gates)
- **TDD Workflow**: [tdd_workflow.md](./tdd_workflow.md) (Red-green cycles and bugfixes)
- **Git Best Practices**: [git_best_practices.md](./git_best_practices.md) (Commit headers and pre-commit hooks)
- **Skill Lifecycle**: [skill_lifecycle.md](./skill_lifecycle.md) (Agent triggers and skill registrations)
- **Code Review**: [code_review.md](./code_review.md) (Self-critique checklists and templates)

