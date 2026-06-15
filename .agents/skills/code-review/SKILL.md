---
name: code-review
description: 'WHAT: Static architectural check script (bun run review) and cognitive review report (scratch/code_review.md). USE WHEN: Declaring a task done, preparing walkthrough.md, or running final validations.'
---

# Ztui Agent Self-Review Protocol

This skill enforces a deterministic self-review loop for agents before they can declare a task finished or submit a pull request.

## 1. Trigger & Auto-Use Context
- Load and read this skill when: Declaring a task done, preparing `walkthrough.md`, or running final validations.

## 2. Core Policies & Constraints

> [!IMPORTANT]
> **Run Static Review Gate:**
> You **MUST** run the static reviewer:
> ```bash
> bun run review
> ```
> If this exits with code 1 (due to direct widget imports in reconciler or coverage drops), correct the violations and re-run.

> [!IMPORTANT]
> **Cognitive Review Loop:**
> Examine your own `git diff` against the specifications in `/docs/` and write a compliance self-review report to `scratch/code_review.md` covering:
> 1. Reconciler imports decoupling.
> 2. Box primitives & defaultStyle cascades.
> 3. TDD cleanup blocks and Vitest coverage.
> 4. Terminal state signal recovery.
> Fix any failed items before declaring the task complete.

## 3. Reference Documents
For detailed code, style, and testing specifications:
- [code_review.md](../../../docs/code_review.md) (Self-review checklists and report templates)
- [architecture.md](../../../docs/architecture.md) (Architecture boundaries and registries)
- [coding_standards.md](../../../docs/coding_standards.md) (Clean code, Box layouts, style cascades)
- [testing_standards.md](../../../docs/testing_standards.md) (Vitest execution and coverage rules)
- [tdd_workflow.md](../../../docs/tdd_workflow.md) (TDD workflow cycles and examples)
- [diagnostics.md](../../../docs/diagnostics.md) (Inspector endpoints and raw-mode signal recovery)
- [git_best_practices.md](../../../docs/git_best_practices.md) (Conventional commit formats and hooks)

## 4. Evolving This Skill
When adding new codebase gates or extending the checklist, the agent **MUST** update this skill guide.
