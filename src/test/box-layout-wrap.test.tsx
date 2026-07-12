import { describe, expect, test } from "vitest";
import type { Widget } from "../dom/widget.ts";
import { HBox, VBox } from "../react/components.tsx";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

describe("BoxLayout flexWrap", () => {
  test("nowrap (default): overflowing children stay on one line", async () => {
    const t = await mountApp(
      <HBox style={{ width: "100%" }}>
        <HBox id="a" style={{ width: 30 }} />
        <HBox id="b" style={{ width: 30 }} />
        <HBox id="c" style={{ width: 30 }} />
      </HBox>,
    );

    const a = t.findById<Widget>("a")!;
    const b = t.findById<Widget>("b")!;
    const c = t.findById<Widget>("c")!;
    // 90 > 80 available cols, but all three stay on the same row (y=0).
    expect(a.region.y).toBe(0);
    expect(b.region.y).toBe(0);
    expect(c.region.y).toBe(0);
    expect(b.region.x).toBe(30);
    expect(c.region.x).toBe(60);
  });

  test("wrap: children that overflow the row move to a new line", async () => {
    const t = await mountApp(
      <HBox style={{ width: "100%", flexWrap: "wrap" }}>
        <HBox id="a" style={{ width: 30, height: 3 }} />
        <HBox id="b" style={{ width: 30, height: 5 }} />
        <HBox id="c" style={{ width: 30, height: 2 }} />
      </HBox>,
    );

    const a = t.findById<Widget>("a")!;
    const b = t.findById<Widget>("b")!;
    const c = t.findById<Widget>("c")!;

    // a (0-30) and b (30-60) fit on line 1 (60 <= 80); c (60-90) would
    // overflow 80, so it wraps to line 2.
    expect(a.region.y).toBe(0);
    expect(b.region.y).toBe(0);
    expect(a.region.x).toBe(0);
    expect(b.region.x).toBe(30);

    // Line 2 starts below line 1's cross size (max height of a/b = 5).
    expect(c.region.y).toBe(5);
    expect(c.region.x).toBe(0);
  });

  test("wrap: a single child wider than the container does not infinite-loop and still renders", async () => {
    const t = await mountApp(
      <HBox style={{ width: "100%", flexWrap: "wrap" }}>
        <HBox id="wide" style={{ width: 200, height: 2 }} />
        <HBox id="next" style={{ width: 10, height: 2 }} />
      </HBox>,
    );

    const wide = t.findById<Widget>("wide")!;
    const next = t.findById<Widget>("next")!;
    expect(wide.region.y).toBe(0);
    // The oversized child gets its own line; "next" wraps below it.
    expect(next.region.y).toBe(2);
    expect(next.region.x).toBe(0);
  });

  test("wrap: vertical (VBox) wraps into columns", async () => {
    // The screen floors to 80x24 (see vte-integration.test.tsx) and a root
    // widget's own size style is ignored (it always fills the screen), so
    // nest the wrapping VBox under an outer box to give it a real 10-row
    // content rect smaller than that floor.
    const t = await mountApp(
      <VBox>
        <VBox id="target" style={{ height: 10, flexWrap: "wrap" }}>
          <HBox id="a" style={{ height: 6, width: 4 }} />
          <HBox id="b" style={{ height: 6, width: 7 }} />
        </VBox>
      </VBox>,
    );

    const a = t.findById<Widget>("a")!;
    const b = t.findById<Widget>("b")!;
    // a takes the first column (0-6 fits within 10 rows); b (6-12) would
    // overflow 10 rows, so it wraps to a new column at x = a's cross size.
    expect(a.region.x).toBe(0);
    expect(b.region.x).toBe(4);
    expect(b.region.y).toBe(0);
  });
});
