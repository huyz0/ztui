---
name: debug
description: WHAT: REST HTTP Inspector API, simulated inputs, and Raw-Mode terminal cleanup. USE WHEN: Troubleshooting process signals, using inspector.ts, or debugging height collapsing crashes.
---

# Ztui Debug & Diagnostic Guidelines

This skill guide outlines the troubleshooting tools and diagnostics patterns available for the `ztui` framework.

## 1. Trigger & Auto-Use Context
- Load and read this skill when: Troubleshooting process signals, using `inspector.ts`, or debugging height collapsing crashes.

## 2. Core Policies & Constraints

> [!IMPORTANT]
> **REST Inspector Endpoints:**
> Use the built-in HTTP server (`startInspector(app, port)`) to introspect DOM tree structures (`GET /dom`), capture render buffers (`GET /render`), or inject virtual mouse/key inputs (`POST /input`).

> [!WARNING]
> **Border Height Collapsing:**
> Borders consume 2 vertical cells. If a widget with borders has height <=2, the Content viewport collapses to 0. Always ensure bordered widgets (such as Button and Input) have default height of at least 3.

## 3. Reference Documents
For detailed descriptions on REST endpoints and terminal state handling:
- [diagnostics.md](../../../docs/diagnostics.md)

## 4. Evolving This Skill
When adding inspector endpoints, improving terminal recovery hooks, or resolving layout diagnostics bugs, the agent **MUST** update this skill guide.
