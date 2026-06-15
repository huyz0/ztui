---
name: architecture
description: 'WHAT: Layer boundaries and circular import constraints. USE WHEN: Modifying folders, changing imports in src/react/host-config.ts, or adding architectural layers.'
---

# Ztui Architecture Rules & Boundaries

This skill guides agents on the layer separation, module boundaries, and circular import constraints of the Ztui framework.

## 1. Trigger & Auto-Use Context
- Load and read this skill when: Modifying folders, changing imports in `src/react/host-config.ts`, or adding architectural layers.

## 2. Core Policies & Constraints

> [!IMPORTANT]
> **No Circular Host-Config Dependencies:**
> Reconciler hooks inside `src/react/host-config.ts` must never import widget subclasses. Use dynamic registries (`registerElement`) to instantiate elements dynamically.

> [!WARNING]
> **Zero Third-Party Dependency Rule:**
> All layout solvers and styling resolver logic must remain implemented natively in pure TypeScript. Do not introduce external layout binaries.

## 3. Reference Documents
For detailed specifications and architectural diagrams, read:
- [architecture.md](../../../docs/architecture.md)

## 4. Evolving This Skill
When introducing new architectural layers or layout engines, the agent **MUST** update this skill guide.
