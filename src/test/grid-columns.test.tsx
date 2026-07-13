import { describe, expect, test } from "vitest";
import type { Widget } from "../dom/widget.ts";
import { Grid, HBox } from "../react/components.tsx";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

describe("Grid gridColumns", () => {
  test("defaults to 2 columns", async () => {
    const t = await mountApp(
      <Grid>
        <HBox id="a" />
        <HBox id="b" />
        <HBox id="c" />
      </Grid>,
    );

    const a = t.findById<Widget>("a")!;
    const b = t.findById<Widget>("b")!;
    const c = t.findById<Widget>("c")!;
    expect(a.region.y).toBe(b.region.y);
    expect(c.region.y).toBeGreaterThan(a.region.y);
  });

  test("gridColumns style prop configures the column count", async () => {
    const t = await mountApp(
      <Grid style={{ gridColumns: 4 }}>
        <HBox id="a" />
        <HBox id="b" />
        <HBox id="c" />
        <HBox id="d" />
      </Grid>,
    );

    const a = t.findById<Widget>("a")!;
    const b = t.findById<Widget>("b")!;
    const c = t.findById<Widget>("c")!;
    const d = t.findById<Widget>("d")!;
    // All 4 fit on one row when configured for 4 columns.
    expect(a.region.y).toBe(b.region.y);
    expect(b.region.y).toBe(c.region.y);
    expect(c.region.y).toBe(d.region.y);
    expect(d.region.x).toBeGreaterThan(c.region.x);
  });
});
