---
name: tdd
description: WHAT: TDD Red-Green cycle and Vitest 90% coverage gates. USE WHEN: Implementing features, fixing bugs, running tests via vitest, or writing src/**/*.test.ts.
---

# Test-Driven Development (TDD) & Testing Standards

This skill enforces a disciplined programming workflow and testing standards for the Ztui framework.

## 1. Trigger & Auto-Use Context
- Load and read this skill when: Implementing features, fixing bugs, running tests via vitest, or writing `src/**/*.test.ts` / `src/**/*.test.tsx`.

## 2. Core Policies & Constraints

> [!IMPORTANT]
> **Write Test First (TDD cycle):**
> Write unit/integration tests before writing any functional code, verify that they fail (Red), implement the minimum code to make them pass (Green), then refactor.

> [!IMPORTANT]
> **Isolated Unit Testing with MockDriver:**
> Use `MockDriver` to write unit tests that run reliably in CI or headless environments. Remember that React reconciler commits are asynchronous; always wait for updates to commit (e.g. `await new Promise((resolve) => setTimeout(resolve, 15))`).

> [!WARNING]
> **Strict Coverage Thresholds:**
> Maintain statement, line, and function coverage at or above **90%** (branch coverage at or above **80%**). All pre-commit check hooks enforce these gates.

## 3. Reference Documents
For detailed descriptions on development cycles and coverage configuration:
- [tdd_workflow.md](../../../docs/tdd_workflow.md)
- [testing_standards.md](../../../docs/testing_standards.md)

## 4. Evolving This Skill
When altering development workflows or adjusting test coverage thresholds in `vitest.config.ts`, the agent **MUST** update this skill guide.
