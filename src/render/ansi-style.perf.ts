import { describe, expect, test } from "vitest";
import { perfGuard, STYLE_SET } from "../test/bench/perf-harness.ts";
import { styleToEscapeCodes } from "./ansi-style.ts";
import { Style } from "./style.ts";

// SGR serialization and per-cell style comparison run once per cell per frame —
// the two innermost operations behind every diff. Budgets ≈3× a healthy ratio.
describe("perf: ANSI style serialization & comparison", () => {
  test("styleToEscapeCodes over a spread of styles", () => {
    perfGuard(
      "ansi.styleToEscapeCodes ×8",
      () => {
        for (const s of STYLE_SET) {
          const { start, end } = styleToEscapeCodes(s);
          if (start.length + end.length < 0) throw new Error("unreachable");
        }
      },
      { iterations: 2000, budget: 2 },
    );
  });

  test("Style.equals on equal styles (the diff's fast path)", () => {
    const a = STYLE_SET[3];
    const b = new Style({ color: "$accent", italic: true, underline: true });
    expect(a.equals(b)).toBe(true); // invariant: structurally-equal styles compare equal
    perfGuard("style.equals (equal)", () => a.equals(b), { iterations: 5000, budget: 1 });
  });

  test("Style.equals on differing styles", () => {
    const a = STYLE_SET[2];
    const b = STYLE_SET[5];
    perfGuard("style.equals (differ)", () => a.equals(b), { iterations: 5000, budget: 1 });
  });
});
