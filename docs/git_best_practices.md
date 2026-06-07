# Git Workflow & Commit Standards

This document describes the revision control principles, conventional commit patterns, and automated Git hooks enforced in the ZTUI repository.

---

## 1. Core Principles & General Guidance

### 1.1 Atomic History
Commit histories must represent a logical sequence of discrete, self-contained changes. Never combine unrelated fixes or features into a single commit. This ensures history remains clean, searchable, and safe to bisect.

### 1.2 Continuous Quality Gate (Shift-Left)
The repository's main branch must remain continuously green and compile-safe. Quality checks are run locally before staging, blocking formatting violations (`bun run lint`) or coverage drops (`bun run test`) before they reach code review.

### 1.3 Standardized Intent Signaling
Commit headers must convey semantic intent (such as feature addition, bug fix, or refactor) at first glance. This enables automated changelog generation and simplifies developer reviews.

---

## 2. Specific Rules & Requirements

### 2.1 Conventional Commits Syntax
- **Rule**: Commit messages MUST comply with the Conventional Commits structure: `<type>(<scope>): <description>`
- **Rule**: Allowed `<type>` categories:
  - `feat`: A new feature (e.g. adding layout containers).
  - `fix`: A bug fix (e.g. resolving stylesheet resolution bugs).
  - `docs`: Documentation updates (e.g. modifying skill policies).
  - `test`: Testing additions or runner configuration changes.
  - `chore`: Maintenance, build scripts, or configurations.
- **Rule**: `<scope>` MUST specify the affected layer in lowercase parentheses (e.g., `layout`, `dom`, `react`, `widgets`, `style`, `skills`).
- **Rule**: The `<description>` MUST:
  - Use the imperative mood (e.g. "add support", not "added support").
  - Start with a lowercase letter.
  - Not end with a period.
  - Keep the header line under **50 characters**.

### 2.2 Branch Naming Rules
- **Rule**: Feature branches MUST use the pattern `feat/<short-description>` (e.g., `feat/flex-grow`).
- **Rule**: Bugfix branches MUST use the pattern `fix/<short-description>` (e.g., `fix/border-collapse`).
- **Rule**: Documentation/Maintenance branches MUST use the pattern `chore/<short-description>` (e.g., `chore/hooks-setup`).

### 2.3 Gated Git Hook Behaviors
- **Rule**: Git hooks are version-controlled under `.githooks/` and auto-registered.
- **Rule**: **Pre-commit Hook (`.githooks/pre-commit`)** MUST execute linting and tests, blocking commits on any warning/error or code coverage drop.
- **Rule**: **Commit-msg Hook (`.githooks/commit-msg`)** MUST validate the commit message header syntax against the conventional commits pattern, blocking invalid entries.

---

## 3. Checklist & Commit Examples

### Good Commit Headers
*   `feat(layout): support flexGrow in horizontal box layout`
*   `fix(style): prevent computedStyle pollution from inline styles`
*   `docs(skills): convert pointers to relative links`

### Bad Commit Headers (Do NOT use)
*   `Fixed layout gaps.` *(Missing type prefix, past tense description, capitalized, ends with period).*
*   `feat: refactored widget registry and wrote tests` *(Missing scope, non-atomic combining feature refactor and tests).*

### Setup Verification
Check that hooks are correctly configured in your local environment:
```bash
git config core.hooksPath .githooks
```

---

## 4. Cross-References

To maintain full compliance with ZTUI constraints, cross-reference these standards:
- **Architecture Blueprint**: [architecture.md](./architecture.md) (Layer boundary rules and dynamic registry)
- **Coding Standards**: [coding_standards.md](./coding_standards.md) (React wrappers, style coercion, and linting rules)
- **Testing & Coverage**: [testing_standards.md](./testing_standards.md) (Vitest configurations and coverage gates)
- **TDD Workflow**: [tdd_workflow.md](./tdd_workflow.md) (Red-green cycles and bugfixes)
- **Diagnostics & Recovery**: [diagnostics.md](./diagnostics.md) (Rest endpoints and process cleanup hooks)
- **Skill Lifecycle**: [skill_lifecycle.md](./skill_lifecycle.md) (Agent triggers and skill registrations)
- **Code Review**: [code_review.md](./code_review.md) (Self-critique checklists and templates)

