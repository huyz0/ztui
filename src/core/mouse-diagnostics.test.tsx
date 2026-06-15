import { createElement } from "react";
import { describe, expect, test } from "vitest";
import { Box } from "../react.ts";
import { mountApp } from "../test/harness.tsx";

describe("app mouse diagnostics", () => {
  test("tracks same-cell skips and throttled move handling", async () => {
    const mounted = await mountApp(createElement(Box, null, "hello"));
    const app = mounted.app as any;

    mounted.driver.simulateMouse(1, 1, "move", "none");
    mounted.driver.simulateMouse(1, 1, "move", "none");
    mounted.driver.simulateMouse(2, 1, "move", "none");
    await mounted.settle(80);

    expect(app.getMouseDiagnostics).toBeTypeOf("function");
    const stats = app.getMouseDiagnostics();
    expect(stats.rawMovesSeen).toBeGreaterThan(0);
    expect(stats.receivedMoves).toBeGreaterThan(0);
    expect(
      stats.throttledImmediate + stats.throttledDeferred + stats.sameCellSkipped,
    ).toBeGreaterThan(0);
  });
});
