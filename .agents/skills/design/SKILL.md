---
name: design
description: 'WHAT: Layout wrapper primitives (<Box>, VBox, HBox, Grid, Dock) and defaultStyle priority. USE WHEN: Creating custom widgets under src/widgets/ or applying React styling layouts.'
---

# Ztui Design and Styling Guidelines

This skill guides agents on component design, layout primitive conventions, and the stylesheet cascade logic.

## 1. Trigger & Auto-Use Context
- Load and read this skill when: Creating custom widgets under `src/widgets/` or applying React styling layouts.

## 2. Core Policies & Constraints

> [!IMPORTANT]
> **Component Cascading Order:**
> Do not directly modify `this.style` inside constructors. Specify browser/component defaults via `this.defaultStyle` so stylesheet specificity rules and inline user style overrides cascade correctly.

> [!WARNING]
> **Layout Container Primitives:**
> All custom layout containers must build on top of the generic `<Box>` widget component, pre-configuring flexDirection, display, and flex styles to enforce DRY positioning calculations.

## 3. Reference Documents
For detailed code standards and style resolutions, read:
- [coding_standards.md](../../../docs/coding_standards.md)

## 4. Evolving This Skill
When adding new layout wrappers or styling rules, the agent **MUST** update this skill guide.
