---
name: git-workflow
description: WHAT: Conventional Commits regex validation and git hooks (.githooks/). USE WHEN: Creating commits, running git commands, or editing .gitignore.
---

# Ztui Git Workflow

This skill governs the git validation, branching, and committing conventions for the Ztui framework.

## 1. Trigger & Auto-Use Context
- Load and read this skill when: Creating commits, running git commands, or editing `.gitignore`.

## 2. Core Policies & Constraints

> [!IMPORTANT]
> **Pre-Commit Verification:**
> All code staged for commit must pass Biome formatting (`bun run lint`) and Vitest test coverage checks. The native git hook `.githooks/pre-commit` enforces these checks deterministically.

> [!IMPORTANT]
> **Conventional Commits & Atomic Commits:**
> All commit messages must follow the Conventional Commits specification. Combine only related modifications; avoid non-atomic commit blocks. Git commit formats are validated by `.githooks/commit-msg`.

## 3. Reference Documents
For detailed conventions and examples of commit messages:
- [git_best_practices.md](../../../docs/git_best_practices.md)

## 4. Evolving This Skill
When updating git hook configurations, package scripts, or repository workflows, the agent **MUST** update this skill guide.
