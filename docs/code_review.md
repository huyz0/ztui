# Code Review & Compliance Standards

This document describes the code review principles, gatekeeper rules, and self-review reporting format enforced in the ZTUI framework.

---

## 1. Core Principles & General Guidance

### 1.1 Shift-Left Validation
Code quality gates must be checked locally before staging or committing changes. Quality is built-in during development, not audited afterwards.

### 1.2 Strict Decoupling
Architectural boundaries must be clean and unidirectional. High-level orchestrators must remain decoupled from specific component implementations.

### 1.3 Minimal Mutability
Maintain a minimal mutable surface area. Declarative styles, user properties, and config options must be treated as read-only. Dynamic state updates should be computed and isolated internally.

---

## 2. Specific Rules & Requirements

Before finalizing any task, check the active `git diff` against these constraints:

### 2.1 Reconciler Decoupling
- **Rule**: `src/react/host-config.ts` MUST NOT import widget classes directly (e.g. `LabelWidget`, `ButtonWidget`).
- **Rule**: Run the static compliance checker script prior to finalizing tasks:
  ```bash
  bun run review
  ```

### 2.2 Layout & Component Composability
- **Rule**: Specialized layout containers (`VBox`, `HBox`, `Grid`, `Dock`) **MUST** build on top of the generic `<Box>` widget rather than duplicating coordinate or layout calculations.
- **Rule**: Custom widgets MUST NOT mutate `this.style` in their constructor; configure styling defaults via `this.defaultStyle` to allow inline styles and CSS specificity cascades to function.

### 2.3 Terminal State Recovery
- **Rule**: Concrete driver implementations altering terminal states MUST register hooks for process events (`exit`, `SIGINT`, `SIGTERM`) to restore the original host shell parameters on unexpected crash.

---

## 3. Checklist & Report Template

### Cognitive Review Report Format
When completing a task, you MUST write a self-critique review report to `scratch/code_review.md` using the exact layout below:

```markdown
# Ztui Agent Code Review Report

## 1. Compliance Checklist
- **Architecture & Boundaries**: [PASS/FAIL] (Verification evidence...)
- **Component Design & Styles**: [PASS/FAIL] (Verification evidence...)
- **TDD, Testing & Coverage**: [PASS/FAIL] (Verification evidence...)
- **Git Workflow & Hooks**: [PASS/FAIL] (Verification evidence...)
- **Code Review Loop Script**: [PASS/FAIL] (Verification evidence...)

## 2. Final Review Verdict
**STATUS: [PASS/FAIL]**
```

---

## 4. Cross-References

To maintain full compliance with ZTUI constraints, cross-reference these standards:
- **Architecture Blueprint**: [architecture.md](./architecture.md) (Layer boundary rules and dynamic registry)
- **Coding Standards**: [coding_standards.md](./coding_standards.md) (React wrappers, style coercion, and linting rules)
- **Testing & Coverage**: [testing_standards.md](./testing_standards.md) (Vitest configurations and coverage gates)
- **TDD Workflow**: [tdd_workflow.md](./tdd_workflow.md) (Red-green cycles and bugfixes)
- **Diagnostics & Recovery**: [diagnostics.md](./diagnostics.md) (Rest endpoints and process cleanup hooks)
- **Git Best Practices**: [git_best_practices.md](./git_best_practices.md) (Commit headers and pre-commit hooks)
- **Skill Lifecycle**: [skill_lifecycle.md](./skill_lifecycle.md) (Agent triggers and skill registrations)

