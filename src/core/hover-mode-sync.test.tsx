import { createElement } from "react";
import { describe, expect, test } from "vitest";
import { Box } from "../react.ts";
import { mountApp } from "../test/harness.tsx";

describe("hover mode sync", () => {
  test("detects no visible hover interest on a passive screen", async () => {
    const mounted = await mountApp(createElement(Box, null, "hello"));
    expect((mounted.app.input as any).screenHasHoverInterest(mounted.screen)).toBe(false);
  });
});
