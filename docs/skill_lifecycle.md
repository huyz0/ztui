# Skill Lifecycle & Auto-Use Specifications

This document outlines the design principles, directory structures, auto-trigger protocols, and lifecycle rules for the ZTUI Agent Skill System.

---

## 1. Core Principles & General Guidance

### 1.1 Declarative Pointers (No Inline Bloat)
Skills under `.agents/skills/` are strictly configuration pointer assets. They must contain only high-level triggering metadata, critical policy constraints, and relative links pointing to source documents in `/docs/`. Detailed spec files must remain human-visible at the project root to prevent duplicating guides.

### 1.2 Deterministic Auto-Use Routing
Coding agents in completely new sessions must be able to automatically identify and load the correct skill guides without human prompt instructions. The system matches files, command execution, and code symbols against triggers defined in YAML metadata descriptions to route tasks to skills dynamically.

### 1.3 Atomic Evolution
Documentation is treated as code. Whenever features, layout solvers, or testing configurations are refactored, the accompanying skill pointer descriptions and specifications inside `/docs/` must be modified in the same change block.

---

## 2. Specific Rules & Requirements

### 2.1 Skill Folder & Template Rules
- **Rule**: A skill is represented by a directory under `.agents/skills/` (e.g. `.agents/skills/tdd/`).
- **Rule**: Every skill folder MUST contain exactly one `SKILL.md` file holding the frontmatter YAML block, triggers, and pointer references.
- **Rule**: Do not add machine-specific paths (e.g. `/home/tuong/...`) in skill files; use relative paths instead (e.g. `../../../docs/`).

### 2.2 Auto-Trigger Frontmatter Schema
- **Rule**: Frontmatter YAML metadata `description` MUST use the exact pattern:
  `description: WHAT: [Short summary]. USE WHEN: [Triggers and when to read].`
- **Rule**: The triggers list MUST contain specific:
  - **Config File Paths**: E.g. `src/react/host-config.ts`, `vitest.config.ts`, `.gitignore`.
  - **Glob Patterns**: E.g. `src/widgets/**/*.ts`, `src/**/*.test.ts`.
  - **CLI Commands / Scripts**: E.g. `vitest`, `git`, `bun run review`.
  - **Component Layout Tags**: E.g. `<Box>`, `VBox`, `HBox`, `Grid`, `Dock`.

### 2.3 Lifecycle & Refactoring Rules
- **Rule**: Create a new skill folder under `.agents/skills/` only if a completely new operational domain is added to ZTUI (e.g. HTTP Inspector API or CLI command parser).
- **Rule**: If a `SKILL.md` file exceeds **150 lines**, you MUST extract detailed rules or specs into a new markdown specification under `/docs/` and convert the skill file into a lean pointer referencing it.

---

## 3. Checklist & Examples

### Lean Skill Policy Template (`SKILL.md`)
```markdown
---
name: sample-skill
description: WHAT: Example skill summary. USE WHEN: Editing src/widgets/sample.ts or running sample commands.
---

# Ztui Sample Guidelines

## 1. Trigger & Auto-Use Context
- Load and read this skill when: Editing `src/widgets/sample.ts`.

## 2. Core Policies & Constraints
> [!IMPORTANT]
> Keep code decoupled.

## 3. Reference Documents
For detailed specs, read:
- [coding_standards.md](../../../docs/coding_standards.md)

## 4. Evolving This Skill
When modifying related features, the agent MUST update this skill guide.
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
- **Code Review**: [code_review.md](./code_review.md) (Self-critique checklists and templates)

