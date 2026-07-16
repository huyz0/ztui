import { describe, expect, test } from "vitest";
import { Sparkline, VBox } from "../react/components.tsx";
import type { SparklineWidget } from "../widgets/data/sparkline.ts";
import "../widgets/index.ts";
import { mountApp } from "./harness.tsx";

const OPTS = {
  cols: 40,
  rows: 8,
  capabilities: { glyphProtocol: false, graphicsProtocol: "none" as const },
};

describe("Sparkline", () => {
  test("renders one bar per value, low to high across the glyph ramp", async () => {
    const t = await mountApp(
      <VBox style={{ width: 20 }}>
        <Sparkline id="s" data={[0, 1, 2, 3, 4, 5, 6, 7]} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const text = t.text();
    expect(text).toContain("▁"); // minimum
    expect(text).toContain("█"); // maximum
    // The bars sit in ascending order somewhere on the row.
    expect(text).toMatch(/▁.*█/);
  });

  test("a flat series renders all-minimum bars (no divide-by-zero)", async () => {
    const t = await mountApp(
      <VBox style={{ width: 20 }}>
        <Sparkline id="s" data={[5, 5, 5, 5]} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    expect(t.text()).toContain("▁");
    expect(t.text()).not.toContain("█");
  });

  test("showValue prints the latest value after the bars", async () => {
    const t = await mountApp(
      <VBox style={{ width: 20 }}>
        <Sparkline id="s" data={[1, 2, 42]} showValue />
      </VBox>,
      OPTS,
    );
    await t.settle();
    expect(t.text()).toContain("42");
  });

  test("when narrower than the series, shows the most recent tail", async () => {
    const data = Array.from({ length: 50 }, (_, i) => i);
    const t = await mountApp(
      <VBox style={{ width: 20 }}>
        <Sparkline id="s" style={{ width: 5 }} data={data} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SparklineWidget>("s") as SparklineWidget;
    // 5 cells wide → only the last 5 values (all near the max) are drawn, so the
    // row is dominated by the tallest bar rather than the early low ones.
    expect(t.text()).toContain("█");
    expect(w.data).toHaveLength(50); // full series retained on the widget
  });

  test("an empty series renders nothing and doesn't throw", async () => {
    const t = await mountApp(
      <VBox style={{ width: 20 }}>
        <Sparkline id="s" data={[]} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    expect(t.text()).not.toContain("▁");
  });

  test("showValue formats a non-integer last value to one decimal", async () => {
    const t = await mountApp(
      <VBox style={{ width: 20 }}>
        <Sparkline id="s" data={[1, 2, 3.14762]} showValue />
      </VBox>,
      OPTS,
    );
    await t.settle();
    expect(t.text()).toContain("3.1");
    expect(t.text()).not.toContain("3.14762");
  });

  test("measure() falls back to intrinsic size for a non-numeric width/height", async () => {
    const t = await mountApp(
      <VBox style={{ width: 20 }}>
        <Sparkline id="s" data={[1, 2, 3]} style={{ width: "1fr", height: "1fr" }} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    const w = t.findById<SparklineWidget>("s") as SparklineWidget;
    expect(w.measuredWidth).toBeGreaterThan(0);
    expect(w.measuredHeight).toBeGreaterThan(0);
  });

  test("falls back through the $accent CSS variable when no explicit color is set", async () => {
    const t = await mountApp(
      <VBox style={{ width: 20 }}>
        <Sparkline id="s" data={[1, 2, 3]} />
      </VBox>,
      OPTS,
    );
    await t.settle();
    // No style.color was set, so render() takes the $accent/default fallback
    // path instead of computedStyle.color - just verify it doesn't blow up and
    // still draws bars.
    expect(t.text()).toMatch(/[▁▂▃▄▅▆▇█]/);
  });
});
