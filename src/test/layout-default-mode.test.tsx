import { describe, expect, test } from "vitest";
import { Box } from "../react.ts";
import { mountApp } from "./harness.tsx";

describe("default layout mode", () => {
  test("a plain Box with no layout/display style stacks two-or-more children instead of overlapping them", async () => {
    // Regression: with no layout/display style, resolveAllLayouts() placed
    // every child at the identical full content rect — fine for the common
    // single-child "wrapper" case, but silently overlapping when a plain
    // container (the generic primitive every container is supposed to
    // compose, per docs/architecture.md) actually has multiple children.
    // Widget.measure() already sized such a parent as if its children
    // stacked; placement now matches that instead of stacking them on top of
    // each other.
    const t = await mountApp(
      <Box id="root" style={{ width: 10, height: 10 }}>
        <Box id="a" style={{ height: 2 }} />
        <Box id="b" style={{ height: 3 }} />
      </Box>,
    );
    await t.settle();
    const a = t.findById("a");
    const b = t.findById("b");
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    // b must be stacked below a, not painted at the same y.
    expect(b?.region.y).toBe((a?.region.y ?? 0) + (a?.region.height ?? 0));
  });

  test("a single-child plain Box still fills the full content rect (unchanged wrapper behavior)", async () => {
    const t = await mountApp(
      <Box id="root" style={{ width: 10, height: 10 }}>
        <Box id="only" />
      </Box>,
    );
    await t.settle();
    const root = t.findById("root");
    const only = t.findById("only");
    expect(only?.region.width).toBe(root?.region.width);
    expect(only?.region.height).toBe(root?.region.height);
  });
});
