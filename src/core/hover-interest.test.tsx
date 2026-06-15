import { createElement } from "react";
import { describe, expect, test } from "vitest";
import { Box } from "../react.ts";
import { mountApp } from "../test/harness.tsx";

describe("hover interest fast path", () => {
  test("ignores move-only hover work when the screen has no hover interest", async () => {
    const mounted = await mountApp(createElement(Box, null, "hello"));
    const app = mounted.app as any;

    mounted.driver.simulateMouse(1, 1, "move", "none");
    mounted.driver.simulateMouse(2, 1, "move", "none");
    await mounted.settle(80);

    expect(typeof app.getMouseDiagnostics).toBe("function");
    const stats = app.getMouseDiagnostics();
    expect(stats.rawMovesSeen).toBeGreaterThan(0);
    expect(stats.receivedMoves).toBeGreaterThan(0);
    expect((app as any).hoveredWidget).toBeNull();
  });
});
