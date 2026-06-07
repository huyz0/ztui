---
name: manage-skills
description: WHAT: Governance rules for Agent Skill System. USE WHEN: Modifying files under .agents/skills/ or creating/updating skills.
---

# Ztui Skill Management

This skill governs the structure, validation, and lifecycle of the agent skill system in Ztui.

## 1. Trigger & Auto-Use Context
- Load and read this skill when: Modifying files under `.agents/skills/` or creating/updating skills.

## 2. Core Policies & Constraints

> [!IMPORTANT]
> **Specification Separation (No Inline Rules):**
> Do not store inline rules, checklists, or guidelines inside `SKILL.md` files. Main skill files must remain pointer-based configurations (under 100 lines) that reference documents under `/docs/`.

> [!IMPORTANT]
> **Frontmatter Standard:**
> All skill frontmatter descriptions **MUST** use the exact pattern:
> `description: WHAT: [Short summary]. USE WHEN: [Triggers and when to read].`
> Trigger descriptions must list specific file paths, directories, commands, or HTML tags.

## 3. Reference Documents
For detailed specs on the skill folders lifecycle and layout:
- [skill_lifecycle.md](../../../docs/skill_lifecycle.md)

## 4. Evolving This Skill
When modifying the skill manager layout, the agent **MUST** update this skill guide and its references to keep standards in sync.
