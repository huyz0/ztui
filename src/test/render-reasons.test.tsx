import { createElement } from "react";
import { describe, expect, test } from "vitest";
import { Box } from "../react.ts";
import { mountApp } from "./harness.tsx";

describe("render reason instrumentation", () => {
  test("records explicit queueRender reasons", async () => {
    const mounted = await mountApp(createElement(Box, null, "hello"));
    const app = mounted.app as any;

    app.queueRender("test:manual");
    await mounted.settle(20);

    expect(app.getRenderReasonStats).toBeTypeOf("function");
    expect(app.getRenderReasonStats()["test:manual"]).toBeGreaterThan(0);
  });

  test("records hover-css render reasons when hover rules are present", async () => {
    const mounted = await mountApp(createElement(Box, { id: "hover-target" }, "hello"));
    const app = mounted.app as any;
    app.loadStyles("#hover-target:hover { color: red; }");
    await mounted.settle(20);

    mounted.driver.simulateMouse(0, 0, "move", "none");
    mounted.driver.simulateMouse(1, 0, "move", "none");
    await mounted.settle(80);

    const stats = app.getRenderReasonStats();
    expect(stats["mouse:hover-css"]).toBeGreaterThan(0);
  });
});
