import { describe, expect, test } from "vitest";
import { getNamedHoverScenario } from "../tools/mouse-hover-benchmark.ts";

describe("named hover scenarios", () => {
  test("provides a gallery-sidebar-boundary path", () => {
    const scenario = getNamedHoverScenario("gallery-sidebar-boundary", { cols: 100, rows: 30 });
    expect(scenario).toBeTruthy();
    expect(scenario?.ui).toBeTruthy();
    expect(scenario?.sweep.path?.length).toBeGreaterThan(5);
  });
});
