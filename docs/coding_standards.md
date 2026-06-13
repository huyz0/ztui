# Coding & Software Design Standards

This document describes the software design principles, coding patterns, linting rules, and formatting standards enforced in the ZTUI framework.

---

## 1. Core Principles & General Guidance

### 1.1 Modularity & Anti-God Object Pattern
Do not create complex classes, files, or folders that manage multiple unrelated concerns. Modules must remain small, focused, and single-purpose.
- If a class or file exceeds **200 lines**, actively evaluate if it can be split into smaller, focused modules.
- If a folder contains more than **10 files**, organize them into logical child subdirectories. Both the widgets and their React wrappers are grouped symmetrically under `controls/`, `data/`, `feedback/`, `layout/`, `media/`, and `text/` (e.g. `src/widgets/controls/button.ts` pairs with `src/react/components/controls/button.tsx`) so the widget↔component pairing stays obvious. The React side additionally has an `overlay/` group.

### 1.2 Unidirectional Dependency Flow
Module dependencies must flow in one direction only. Circular references (whether direct or indirect via index exports) are strictly forbidden. High-level orchestrators must remain decoupled from specific component implementations.

### 1.3 DRY (Don't Repeat Yourself)
Avoid copy-pasting layout calculations, styling defaults, or drawing logic. Consolidate layout calculations into common parent controllers. Specialized layout containers must reuse generic Box primitive widget configurations rather than duplicating logic.

### 1.4 Separation of API & Internal Concern (Minimal Mutable Surface)
Keep state and style mutations strictly internal to the framework. External configurations (such as inline style objects passed via JSX attributes) should be treated as read-only. All resolved style calculations must write to separate internal fields (like `Widget.computedStyle`), leaving the original declarative `Widget.style` object unpolluted.

### 1.5 Minimal Change & Conciseness (Anti-Verbosity)
Write code that is minimal, precise, and directly addresses the requirement. Do not write verbose, speculative, or dead code. Let standard type systems and clean structures document the intent of your code.

---

## 2. Specific Rules & Requirements

### 2.1 React Component Wrappers
- **Rule**: Every wrapper component **MUST** reside in its own file under the matching category folder in `src/react/components/` (e.g., `src/react/components/text/label.tsx`).
- **Rule**: Implement wrappers as thin, pure function components. Pure passthroughs to a host element **MUST** be built with the `hostComponent("ztui-…")` factory (`src/react/components/factory.tsx`) rather than a hand-written destructure-and-respread body; Box-derived layout presets use `presetBox(...)`. Only wrappers with real logic (default props, icon resolution) are written out by hand.
- **Rule**: Prop interfaces must extend `ComponentProps` from `src/react/components/types.ts`.

### 2.2 Styles Resolution Defaults
- **Rule**: Custom widgets must **never** mutate `this.style` inside their constructor. Specify defaults via `this.defaultStyle` so that stylesheet rules and inline JSX properties cascade correctly.
- **Rule**: Custom widgets **MUST** invoke `super.render(buffer)` inside their `render()` method to correctly execute background fills and border rendering.

### 2.3 Driver-Concern Containment
- **Rule**: Backend specifics (raw ANSI/escape sequences, `process.stdout`/`stdin`, protocol branching) live **only** in `src/driver/*`. Widgets (`src/widgets/**`) and the `App`/core orchestrator (`src/core/**`) must stay backend-neutral: widgets emit cells/`Segment`s; `App` talks to the abstract `Driver` API. When you need new terminal output, add a `Driver` method instead of inlining the escape. See `code_review.md §2.4` for the exact rules and the `bun run review` guard.

### 2.4 Style Coercion Rules
- **Rule**: The CSS resolver coerces specific string layout properties into rich objects:
  - **`margin` / `padding`**: Auto-coerced from space-separated numbers (e.g. `"1 2"` or `"4"`) into an instance of the `Spacing` class.
  - **Constraints (`minWidth`, `minHeight`, `maxWidth`, `maxHeight`)**: Parsed and coerced into raw integer bounds.

---

## 3. Checklist & Examples

### React Component Wrapper Template
Pure passthroughs use the `hostComponent` factory — declare the typed props and bind the host tag in one line. The factory forwards every prop (including `children`); the reconciler's host-config maps any prop matching a widget field.
```tsx
import { hostComponent } from "../factory.tsx";
import type { ComponentProps } from "../types.ts";

export interface CustomProps extends ComponentProps {
  customAttribute?: string;
}

export const Custom = hostComponent<CustomProps>("ztui-custom");
```
Only write a hand-rolled function component when the wrapper has real logic (injecting default props, resolving an icon, etc.); even then keep it thin and delegate the host element to `hostComponent`/`presetBox`.

### Static Analysis & Formatting Checklist
Ensure code passes Biome linting and formatting before committing:
- Execute syntax review: `bun run lint` (or auto-formatting: `bun run lint:fix`).
- **Indentation**: Spaces only (size 2).
- **Quotes**: Double quotes (`"`) for strings.
- **Imports**: Sorted automatically by Biome (`organizeImports`).
- **Trailing Commas**: Placed in multi-line objects, arrays, and imports.
- **Ignored Directories**: Never run lint scans against `/coverage/`.

---

## 4. Cross-References

To maintain full compliance with ZTUI constraints, cross-reference these standards:
- **Architecture Blueprint**: [architecture.md](./architecture.md) (Layer boundary rules and dynamic registry)
- **Testing & Coverage**: [testing_standards.md](./testing_standards.md) (Vitest configurations and coverage gates)
- **TDD Workflow**: [tdd_workflow.md](./tdd_workflow.md) (Red-green cycles and bugfixes)
- **Diagnostics & Recovery**: [diagnostics.md](./diagnostics.md) (Rest endpoints and process cleanup hooks)
- **Git Best Practices**: [git_best_practices.md](./git_best_practices.md) (Commit headers and pre-commit hooks)
- **Skill Lifecycle**: [skill_lifecycle.md](./skill_lifecycle.md) (Agent triggers and skill registrations)
- **Code Review**: [code_review.md](./code_review.md) (Self-critique checklists and templates)

