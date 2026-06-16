import { createElement } from "react";
import { describe, expect, test } from "vitest";
import { VBox, View } from "../react.ts";
import { perfGuard } from "../test/bench/perf-harness.ts";
import { mountApp } from "../test/harness.tsx";

// Style resolution runs for every widget on every full frame: theme `$var`
// lookups plus selector matching/merging. A regression here scales with tree
// size, so it's measured per-widget on a real mounted tree.
describe("perf: CSS resolution (css-resolver.ts)", () => {
  test("resolveVariable resolves a theme token", async () => {
    const t = await mountApp(createElement(VBox, null, createElement(View, { id: "node" }, "x")), {
      cols: 40,
      rows: 10,
    });
    await t.settle();
    const node = t.findById("node");
    expect(node).toBeTruthy();
    // Invariant: a known theme token resolves to a concrete colour, not the raw `$var`.
    const resolved = t.app.cssResolver.resolveVariable(node!, "$accent");
    expect(resolved.startsWith("$")).toBe(false);
    perfGuard(
      "css.resolveVariable ($accent)",
      () => t.app.cssResolver.resolveVariable(node!, "$accent"),
      { iterations: 5000, budget: 2 },
    );
  });

  test("resolveStyles merges rules + defaults for a widget", async () => {
    const t = await mountApp(createElement(VBox, null, createElement(View, { id: "node" }, "x")), {
      cols: 40,
      rows: 10,
    });
    await t.settle();
    const node = t.findById("node");
    perfGuard("css.resolveStyles", () => t.app.cssResolver.resolveStyles(node!, false), {
      iterations: 3000,
      budget: 1,
    });
  });
});
