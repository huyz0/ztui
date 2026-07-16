import { createElement } from "react";
import { describe, expect, test } from "vitest";
import { Gallery } from "../../examples/gallery/gallery.tsx";
import { getNamedHoverScenario } from "../tools/mouse-hover-benchmark.ts";

describe("named hover scenarios", () => {
  test("provides a gallery-sidebar-boundary path", () => {
    const scenario = getNamedHoverScenario("gallery-sidebar-boundary", {
      cols: 100,
      rows: 30,
      ui: createElement(Gallery),
    });
    expect(scenario).toBeTruthy();
    expect(scenario?.ui).toBeTruthy();
    expect(scenario?.sweep.path?.length).toBeGreaterThan(5);
  });

  test("returns null for an unknown scenario name", () => {
    expect(getNamedHoverScenario("does-not-exist")).toBeNull();
  });
});
