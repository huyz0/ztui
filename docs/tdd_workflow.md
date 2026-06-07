# Test-Driven Development (TDD) Workflow

This document describes the test-driven development principles, implementation flows, and bugfix verification workflows for ZTUI.

---

## 1. Core Principles & General Guidance

### 1.1 Red-Green-Refactor Cycle
All functional changes must proceed strictly through the three phases of TDD:
1. **Red**: Write a failing unit or integration test before implementing any functional code.
2. **Green**: Write the minimal amount of code required to make the test pass.
3. **Refactor**: Clean up the implementation, optimize structures, and format the files while ensuring the test remains green.

### 1.2 Verification of Fail States (Preventing False Positives)
You must execute tests *before* writing the code fix/feature to verify that the new test fails. This ensures that the test validates the target logic and catches regressions, rather than passing unconditionally.

### 1.3 Minimal Implementation
To avoid over-engineering and keep the codebase clean, implement only what is necessary to resolve the current failing assertions.

---

## 2. Specific Rules & Requirements

### 2.1 Feature Implementation Rules
- **Rule**: Every new feature MUST begin with a new test case residing in the corresponding `.test.ts` or `.test.tsx` file.
- **Rule**: The test case MUST fail initially due to missing functionality or failing assertions.
- **Rule**: Functional code changes must write only the minimal implementation required to satisfy the assertions.

### 2.2 Bug Fix Rules
- **Rule**: Every bug or crash resolution MUST begin with a test case reproducing the failure.
- **Rule**: You MUST verify that the test reproduces the failure/crash before modifying code.
- **Rule**: The applied fix MUST resolve the specific test failure while maintaining global test coverage thresholds.

---

## 3. Checklist & Walkthroughs

### Step-by-Step TDD Example: Label Truncation
1. **Write the Test (Red)** (e.g. inside `src/dom/dom.test.ts`):
   ```typescript
   test("Label text truncation with ellipsis", () => {
     const label = new LabelWidget();
     label.style.width = 5;
     label.text = "Hello World"; // Exceeds width of 5
     
     // Expect it to truncate to fit "He..." (width 5)
     expect(label.getDisplayValue()).toBe("He...");
   });
   ```
2. **Verify Failure**: Run `bun run test` and confirm the runner fails with a compilation or assertion error.
3. **Implement Code (Green)**: Write minimal logic in `src/widgets/label.ts`:
   ```typescript
   export class LabelWidget extends Widget {
     public text = "";

     public getDisplayValue(): string {
       const width = typeof this.style.width === "number" ? this.style.width : 999;
       if (this.text.length > width) {
         return this.text.slice(0, Math.max(0, width - 3)) + "...";
       }
       return this.text;
     }
   }
   ```
   Confirm that `bun run test` passes.
4. **Refactor**: Clean up type coercions and check formatting:
   ```typescript
     public getDisplayValue(): string {
       const width = Number(this.style.width);
       if (!Number.isNaN(width) && this.text.length > width) {
         return `${this.text.slice(0, Math.max(0, width - 3))}...`;
       }
       return this.text;
     }
   ```
   Re-run tests to confirm code is still green, and clean format with `bun run lint:fix`.

---

## 4. Cross-References

To maintain full compliance with ZTUI constraints, cross-reference these standards:
- **Architecture Blueprint**: [architecture.md](./architecture.md) (Layer boundary rules and dynamic registry)
- **Coding Standards**: [coding_standards.md](./coding_standards.md) (React wrappers, style coercion, and linting rules)
- **Testing & Coverage**: [testing_standards.md](./testing_standards.md) (Vitest configurations and coverage gates)
- **Diagnostics & Recovery**: [diagnostics.md](./diagnostics.md) (Rest endpoints and process cleanup hooks)
- **Git Best Practices**: [git_best_practices.md](./git_best_practices.md) (Commit headers and pre-commit hooks)
- **Skill Lifecycle**: [skill_lifecycle.md](./skill_lifecycle.md) (Agent triggers and skill registrations)
- **Code Review**: [code_review.md](./code_review.md) (Self-critique checklists and templates)

